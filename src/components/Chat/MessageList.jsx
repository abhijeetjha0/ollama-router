import React, { useEffect, useRef } from 'react';
import { MessageItem } from './MessageItem.jsx';
import { WelcomeState } from './WelcomeState.jsx';
import { formatMarkdown } from '../../utils.js';

export function MessageList({
  messages,
  isStreaming = false,
  streamingContent = null,
  onSelectPrompt,
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, streamingContent, isStreaming]);

  const hasMessages = Array.isArray(messages) && messages.length > 0;
  const hasAssistantMessage = hasMessages && messages[messages.length - 1].role === 'assistant';

  return (
    <div id="messages-container" className="messages-container" ref={containerRef}>
      <div id="messages" className="messages">
        {!hasMessages && !isStreaming ? (
          <WelcomeState onSelectPrompt={onSelectPrompt} />
        ) : (
          <>
            {messages.map((msg, idx) => {
              const isLast = idx === messages.length - 1;
              const isGeneratingThis = isLast && isStreaming && msg.role === 'assistant';

              return (
                <MessageItem
                  key={msg.id || idx}
                  message={msg}
                  isGenerating={isGeneratingThis}
                  streamingContent={isGeneratingThis ? streamingContent : null}
                />
              );
            })}

            {/* Fallback only if streaming starts before assistant placeholder is in messages */}
            {isStreaming && !hasAssistantMessage && (
              <div className="message message--assistant" id="streaming-message">
                <div className="message__body">
                  <div className="message__bubble">
                    <span dangerouslySetInnerHTML={{ __html: formatMarkdown(streamingContent || '') }} />
                    <span className="message__cursor"></span>
                  </div>
                  <div className="message__meta">Generating…</div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
