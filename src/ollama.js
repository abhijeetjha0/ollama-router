/**
 * Ollama Router — Ollama API Client
 * 
 * Handles all communication with the local Ollama instance.
 */

import { store } from './store.js';

class OllamaClient {
  /** 
   * Get the configured base URL.
   * Uses relative paths for default localhost to leverage Vite proxy (avoids CORS).
   */
  get baseUrl() {
    const configured = store.state.settings.ollamaUrl || 'http://localhost:11434';
    // In dev mode, use relative URLs so Vite proxy handles CORS
    if (configured === 'http://localhost:11434' || configured === 'http://127.0.0.1:11434') {
      return '';
    }
    return configured;
  }

  /** Get the raw configured URL (for health checks that need full URL) */
  get rawUrl() {
    return store.state.settings.ollamaUrl || 'http://localhost:11434';
  }

  /**
   * Check if Ollama is running.
   * @returns {Promise<boolean>}
   */
  async checkHealth() {
    try {
      // Health check needs the actual URL, not the proxied one
      const url = this.baseUrl || this.rawUrl;
      const response = await fetch(url + '/api/tags', {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Infer creator or developer organization from model name and family.
   * @param {string} name
   * @param {string} family
   * @returns {string}
   */
  inferDeveloper(name, family) {
    const s = `${name} ${family || ''}`.toLowerCase();
    if (s.includes('qwen')) return 'Alibaba';
    if (s.includes('gemma')) return 'Google';
    if (s.includes('laya')) return 'Laya';
    if (s.includes('nomic')) return 'Nomic AI';
    if (s.includes('llama')) return 'Meta';
    if (s.includes('mistral') || s.includes('mixtral')) return 'Mistral AI';
    if (s.includes('phi')) return 'Microsoft';
    if (s.includes('deepseek')) return 'DeepSeek';
    if (s.includes('minicpm')) return 'OpenBMB';
    if (s.includes('moondream')) return 'Vikhyat';
    return '';
  }

  /**
   * Format context token window to human readable representation.
   * @param {number|null} tokens
   * @returns {string}
   */
  formatContextTokens(tokens) {
    if (!tokens || typeof tokens !== 'number') return '';
    if (tokens >= 1024) {
      const k = Math.round(tokens / 1024);
      return `${k}k ctx`;
    }
    return `${tokens} ctx`;
  }

  /**
   * List all locally available models with rich metadata.
   * Enriches models (including MLX/safetensors) by querying /api/show when details are missing.
   * @returns {Promise<Array>}
   */
  async listModels() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const rawModels = data.models || [];

      return await Promise.all(
        rawModels.map(async (model) => {
          let showData = null;
          const isMlx = model.details?.runner === 'mlx' || model.details?.format === 'safetensors' || model.name.toLowerCase().includes('mlx');
          const isMissingMeta = !model.details?.parameter_size || !model.details?.family || !model.details?.context_length;

          if (isMlx || isMissingMeta) {
            try {
              const showRes = await fetch(`${this.baseUrl}/api/show`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: model.name }),
                signal: AbortSignal.timeout(3000),
              });
              if (showRes.ok) {
                showData = await showRes.json();
              }
            } catch {
              // Graceful fallback to raw tag metadata
            }
          }

          const nameLower = model.name.toLowerCase();
          const families = Array.isArray(model.details?.families)
            ? model.details.families
            : (Array.isArray(showData?.details?.families) ? showData.details.families : []);
          const capabilities = Array.isArray(model.details?.capabilities)
            ? model.details.capabilities
            : (Array.isArray(showData?.capabilities) ? showData.capabilities : []);

          const isDecision = capabilities.includes('decision') || nameLower.includes('decision') || nameLower.includes('systemone') || nameLower.includes('laya');
          const isEmbedding = capabilities.includes('embedding') || nameLower.includes('embed') || families.includes('bert') || families.includes('nomic-bert');
          
          // Dedicated vision models: has CLIP projector or explicit -vl / vision naming
          const isVision = families.some(f => f.toLowerCase().includes('clip')) ||
            nameLower.includes('-vl') ||
            nameLower.includes(':vl') ||
            nameLower.includes('vision') ||
            nameLower.includes('llava') ||
            nameLower.includes('bakllava') ||
            nameLower.includes('minicpm-v') ||
            nameLower.includes('moondream');

          // Dedicated coding models
          const isCode = nameLower.includes('coder') ||
            nameLower.includes('starcoder') ||
            nameLower.includes('deepseek-coder') ||
            nameLower.includes('codellama') ||
            nameLower.includes('codeqwen') ||
            nameLower.includes('code');

          // Dedicated function-only models (fine-tuned exclusively for tool execution, e.g. functiongemma)
          const isFunction = nameLower.startsWith('function') ||
            nameLower.includes('functiongemma') ||
            nameLower.includes('toolbench') ||
            nameLower.includes('gorilla-openfunctions') ||
            nameLower.includes('nexusflow');

          // Chat models: all models eligible for conversation (includes general chat, code, reasoning, creative, vision, and function models)
          const isChat = !isDecision && !isEmbedding;

          const derivedCapabilities = [...capabilities];
          if (isChat && !derivedCapabilities.includes('completion')) derivedCapabilities.push('completion');
          if (isEmbedding && !derivedCapabilities.includes('embedding')) derivedCapabilities.push('embedding');
          if (isVision && !derivedCapabilities.includes('vision')) derivedCapabilities.push('vision');
          if (isDecision && !derivedCapabilities.includes('decision')) derivedCapabilities.push('decision');
          if (isFunction && !derivedCapabilities.includes('tools')) derivedCapabilities.push('tools');

          const family = showData?.details?.family || model.details?.family || '';
          const parameterSize = showData?.details?.parameter_size || model.details?.parameter_size || '';
          const rawQuant = showData?.details?.quantization_level || model.details?.quantization_level || (nameLower.includes('fp16') ? 'FP16' : '');

          let contextLength = model.details?.context_length || null;
          if (!contextLength && showData?.model_info) {
            const ctxEntry = Object.entries(showData.model_info).find(([k]) => k.includes('context_length'));
            if (ctxEntry) contextLength = ctxEntry[1];
          }

          const runner = showData?.details?.runner || model.details?.runner || (isMlx ? 'mlx' : 'gguf');
          const developer = this.inferDeveloper(model.name, family);

          return {
            name: model.name,
            size: model.size,
            digest: model.digest?.slice(0, 12),
            modifiedAt: model.modified_at,
            family: family || 'unknown',
            parameterSize: parameterSize || '—',
            quantization: rawQuant || '—',
            contextLength,
            contextTokensText: this.formatContextTokens(contextLength),
            developer,
            runner: runner ? runner.toUpperCase() : '',
            capabilities: derivedCapabilities,
            isDecisionModel: isDecision,
            isChatModel: isChat,
            isEmbeddingModel: isEmbedding,
            isVisionModel: isVision,
            isCodeModel: isCode,
            isFunctionModel: isFunction,
          };
        })
      );
    } catch (e) {
      console.error('Failed to list models:', e);
      return [];
    }
  }

  /**
   * Run System 1 decision query with fast classifier / decision models.
   * @param {string} model 
   * @param {string} state 
   * @param {object} questions 
   * @returns {Promise<object>}
   */
  async systemOne(model, state, questions) {
    const response = await fetch(`${this.baseUrl}/v1/systemone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        state,
        questions,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`System 1 error: ${err}`);
    }

    return response.json();
  }

  /**
   * Generate vector embeddings via Ollama /api/embed.
   * Supports either a single string or an array of strings.
   * 
   * @param {string} model 
   * @param {string|string[]} input 
   * @returns {Promise<number[]|number[][]>} Returns 1D array if input is string, 2D array if input is array
   */
  async embed(model, input) {
    const isSingle = typeof input === 'string';
    const inputs = isSingle ? [input] : input;

    try {
      const response = await fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          input: inputs,
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        // Fallback for older Ollama versions that use /api/embeddings (single prompt)
        if (response.status === 404 && isSingle) {
          return await this.legacyEmbed(model, input);
        }
        const err = await response.text();
        throw new Error(`Embedding error: ${err}`);
      }

      const data = await response.json();
      if (!data.embeddings || !Array.isArray(data.embeddings)) {
        throw new Error('Invalid embedding response format from Ollama');
      }

      return isSingle ? data.embeddings[0] : data.embeddings;
    } catch (err) {
      if (isSingle) {
        // Attempt legacy endpoint fallback on network/format issues
        try {
          return await this.legacyEmbed(model, input);
        } catch {}
      }
      throw err;
    }
  }

  /**
   * Legacy /api/embeddings fallback for older Ollama servers.
   * @param {string} model 
   * @param {string} prompt 
   * @returns {Promise<number[]>}
   */
  async legacyEmbed(model, prompt) {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Legacy embedding error: ${err}`);
    }
    const data = await response.json();
    return data.embedding;
  }

  /**
   * Strip raw images from messages if the target model is not vision-capable.
   * Prevents Ollama 400 "Multimodal data provided, but model does not support multimodal requests".
   */
  sanitizeMessages(model, messages) {
    if (!Array.isArray(messages)) return messages;
    const modelObj = (store.state.availableModels || []).find(m => m.name === model);
    const isVision = modelObj ? modelObj.isVisionModel : false;
    if (isVision) return messages;

    return messages.map(m => {
      if (m.images) {
        const { images, ...rest } = m;
        return rest;
      }
      return m;
    });
  }

  /**
   * Send a chat message (non-streaming).
   * @param {string} model 
   * @param {Array} messages 
   * @param {object} options
   * @returns {Promise<object>}
   */
  async chat(model, messages, options = {}) {
    const sanitizedMessages = this.sanitizeMessages(model, messages);
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: sanitizedMessages,
        stream: false,
        options: {
          temperature: options.temperature ?? store.state.settings.temperature,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Ollama error: ${err}`);
    }

    return response.json();
  }

  /**
   * Send a chat message with streaming.
   * @param {string} model 
   * @param {Array} messages 
   * @param {object} options
   * @param {function} onToken - Called with each token chunk
   * @param {function} onDone - Called when streaming is complete
   * @param {AbortSignal} signal - Optional abort signal
   * @returns {Promise<void>}
   */
  async chatStream(model, messages, options = {}, onToken, onDone, signal) {
    const sanitizedMessages = this.sanitizeMessages(model, messages);
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: sanitizedMessages,
        stream: true,
        options: {
          temperature: options.temperature ?? store.state.settings.temperature,
        },
      }),
      signal,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Ollama error: ${err}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalData = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.done) {
            finalData = data;
          } else if (data.message?.content) {
            onToken(data.message.content);
          }
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer);
        if (data.done) {
          finalData = data;
        } else if (data.message?.content) {
          onToken(data.message.content);
        }
      } catch {
        // Skip
      }
    }

    onDone(finalData);
  }
}

export const ollama = new OllamaClient();
