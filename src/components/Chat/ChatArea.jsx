import React, { useState, useRef, useCallback } from 'react';
import { useStore } from '../../context/StoreContext.jsx';
import { ChatHeader } from './ChatHeader.jsx';
import { MessageList } from './MessageList.jsx';
import { ChatInput } from './ChatInput.jsx';
import { useFileDrop } from '../../hooks/useFileDrop.js';
import { router } from '../../router.js';
import { ollama } from '../../ollama.js';
import { retrieveRelevantChunks, formatRAGContext } from '../../rag.js';

export function ChatArea() {
  const { state, store } = useStore();
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState(null);
  const [latestMetrics, setLatestMetrics] = useState(null);
  const [latestDecision, setLatestDecision] = useState(null);
  const [indexingStatus, setIndexingStatus] = useState(null);
  const abortControllerRef = useRef(null);

  const activeConv = store.getActiveConversation() || null;

  const {
    isDragging,
    handleFiles,
    onDragOver,
    onDragLeave,
    onDrop,
    onPaste,
  } = useFileDrop(setIndexingStatus);

  const handleStopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const handleSendMessage = useCallback(async () => {
    let content = inputText.trim();
    const activeImages = store.state.activeImages || [];

    if ((!content && activeImages.length === 0) || isStreaming) return;

    if (!content && activeImages.length > 0) {
      content = 'Describe this image in detail and answer any visual questions.';
    }

    if (activeImages.length > 0) {
      const hasVisionModel = (store.state.availableModels || []).some(m => m.isVisionModel);
      if (!hasVisionModel) {
        alert('No vision-capable model (e.g., qwen3-vl:2b or llava) was found in Ollama. Please pull a vision model to analyze images.');
        return;
      }
    }

    let conv = store.getActiveConversation();
    if (!conv) {
      conv = store.createConversation();
    }

    // 1. Evaluate query with Router Engine
    const decision = await router.route(content);
    setLatestDecision(decision);

    // Check Semantic Guardrails
    if (decision.engine === 'guardrail') {
      const userMsg = { role: 'user', content, timestamp: Date.now() };
      store.addMessage(conv.id, userMsg);
      setInputText('');

      const guardMsg = {
        role: 'assistant',
        content: `🛡️ **Prompt Intercepted by Semantic Guardrails**\n\nYour message closely matched security policy rule **"${decision.guardrail.name}"** (${decision.confidence}% semantic similarity).\n\n*Rule Description: ${decision.guardrail.description}*`,
        model: 'Guardrails Shield',
        routeCategory: 'Blocked',
        routeConfidence: decision.confidence,
        routingEngine: 'guardrail',
        routeLatency: decision.latencyMs,
        timestamp: Date.now(),
      };
      store.addMessage(conv.id, guardMsg);
      return;
    }

    if (!decision.model) {
      alert('No chat or vision-capable model available. Please pull a chat model into Ollama.');
      return;
    }

    const imageBase64s = activeImages.map(img => img.base64);
    const imageDataUrls = activeImages.map(img => img.dataUrl);

    // Add user message
    const userMsg = {
      role: 'user',
      content,
      images: imageBase64s.length > 0 ? imageBase64s : undefined,
      imageThumbnails: imageDataUrls.length > 0 ? imageDataUrls : undefined,
      timestamp: Date.now(),
    };
    store.addMessage(conv.id, userMsg);

    // Clear input & active images
    setInputText('');
    store.clearImages();

    // 2. Prepare API messages with System Prompt & Mini-RAG Context
    let systemPromptText = store.state.settings.systemPrompt;
    if (store.state.activeDocuments && store.state.activeDocuments.length > 0 && store.state.embeddingModel) {
      try {
        const relevantChunks = await retrieveRelevantChunks(
          content,
          store.state.activeDocuments,
          store.state.embeddingModel || '',
          3,
          0.32
        );
        if (relevantChunks.length > 0) {
          systemPromptText += formatRAGContext(relevantChunks);
        }
      } catch (e) {
        console.warn('RAG retrieval failed:', e);
      }
    }

    // Sanitize image payloads for non-vision models
    const targetModelObj = (store.state.availableModels || []).find(m => m.name === decision.model);
    const isTargetVision = targetModelObj ? targetModelObj.isVisionModel : false;

    // Refresh conversation reference from store
    const currentConv = store.getActiveConversation() || conv;
    const apiMessages = [
      { role: 'system', content: systemPromptText },
      ...currentConv.messages.map(m => {
        const msgObj = { role: m.role, content: m.content };
        if (isTargetVision && m.images && m.images.length > 0) {
          msgObj.images = m.images;
        }
        return msgObj;
      }),
    ];

    const startTime = performance.now();
    const isStreamingSetting = store.state.settings.streaming !== false;

    if (isStreamingSetting) {
      setIsStreaming(true);
      setStreamingContent('');
      abortControllerRef.current = new AbortController();

      store.addMessage(conv.id, {
        role: 'assistant',
        content: '',
        model: decision.model,
        routeCategory: decision.category,
        routeConfidence: decision.confidence,
        routingEngine: decision.engine,
        routeLatency: decision.latencyMs,
        probabilities: decision.probabilities,
        timestamp: Date.now(),
      });

      let accumulated = '';
      try {
        await ollama.chatStream(
          decision.model,
          apiMessages,
          { temperature: store.state.settings.temperature },
          (token) => {
            if (store.getActiveConversation()?.id !== conv.id) return;
            accumulated += token;
            setStreamingContent(accumulated);
          },
          (finalData) => {
            if (store.getActiveConversation()?.id !== conv.id) return;
            const elapsed = performance.now() - startTime;
            const tokens = finalData
              ? (finalData.eval_count || 0) + (finalData.prompt_eval_count || 0)
              : accumulated.split(/\s+/).length;

            store.updateLastAssistantMessage(conv.id, {
              content: accumulated,
              responseTime: elapsed,
              tokens,
            });

            setLatestMetrics({
              model: decision.model,
              responseTime: elapsed,
              tokens,
            });
            setStreamingContent(null);
          },
          abortControllerRef.current.signal
        );
      } catch (err) {
        if (store.getActiveConversation()?.id === conv.id) {
          if (err.name === 'AbortError') {
            store.updateLastAssistantMessage(conv.id, {
              content: accumulated + ' *(stopped)*',
            });
          } else {
            store.updateLastAssistantMessage(conv.id, {
              content: `Error: ${err.message}`,
            });
          }
        }
        setStreamingContent(null);
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    } else {
      // Non-streaming
      setIsStreaming(true);
      store.addMessage(conv.id, {
        role: 'assistant',
        content: '',
        model: decision.model,
        routeCategory: decision.category,
        routeConfidence: decision.confidence,
        routingEngine: decision.engine,
        routeLatency: decision.latencyMs,
        probabilities: decision.probabilities,
        timestamp: Date.now(),
      });

      try {
        const response = await ollama.chat(decision.model, apiMessages, {
          temperature: store.state.settings.temperature,
        });

        const elapsed = performance.now() - startTime;
        const tokens = (response.eval_count || 0) + (response.prompt_eval_count || 0)
          || response.message?.content?.split(/\s+/).length || 0;

        store.updateLastAssistantMessage(conv.id, {
          content: response.message?.content || '',
          responseTime: elapsed,
          tokens,
        });
        setLatestMetrics({
          model: decision.model,
          responseTime: elapsed,
          tokens,
        });
      } catch (err) {
        store.updateLastAssistantMessage(conv.id, {
          content: `Error: ${err.message}`,
        });
      } finally {
        setIsStreaming(false);
      }
    }
  }, [inputText, isStreaming, store]);

  const messages = activeConv?.messages || [];

  return (
    <section className="chat-area">
      <ChatHeader
        activeConversation={activeConv}
        latestDecision={latestDecision}
        latestMetrics={latestMetrics}
      />

      <MessageList
        messages={messages}
        isStreaming={isStreaming}
        streamingContent={streamingContent}
        onSelectPrompt={(prompt) => setInputText(prompt)}
      />

      <ChatInput
        inputText={inputText}
        setInputText={setInputText}
        onSendMessage={handleSendMessage}
        isStreaming={isStreaming}
        onStopStreaming={handleStopStreaming}
        indexingStatus={indexingStatus}
        onFilesSelected={handleFiles}
        isDragging={isDragging}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onPaste={onPaste}
      />
    </section>
  );
}
