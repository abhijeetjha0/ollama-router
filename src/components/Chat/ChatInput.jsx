import React, { useRef, useEffect } from 'react';
import { useStore } from '../../context/StoreContext.jsx';
import { useRoutingPreview } from '../../hooks/useRoutingPreview.js';
import { AttachmentBar } from './AttachmentBar.jsx';

export function ChatInput({
  inputText,
  setInputText,
  onSendMessage,
  isStreaming,
  onStopStreaming,
  indexingStatus,
  onFilesSelected,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onPaste,
}) {
  const { state } = useStore();
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const decision = useRoutingPreview(inputText);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [inputText]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming) {
        onSendMessage();
      }
    }
  };

  const hasImages = (state.activeImages || []).length > 0;
  const canSend = (inputText.trim().length > 0 || hasImages) && !isStreaming;

  // Build live routing indicator text
  let indicatorText = 'auto';
  let indicatorColor = '';
  let indicatorTooltip = '';

  if (indexingStatus) {
    indicatorText = indexingStatus;
  } else if (decision && decision.category && decision.category !== 'fallback') {
    let icon = '';
    if (decision.engine === 'vector') icon = '🧬 Vector: ';
    else if (decision.engine === 'systemone' || decision.engine === 'laya') icon = '🧠 System 1: ';
    else if (decision.engine === 'vision') icon = '👁️ Vision: ';
    else if (decision.engine === 'keywords') icon = '🏷️ Keywords: ';

    let confStr = '';
    if (decision.confidence !== undefined && decision.confidence !== null) {
      if (decision.engine === 'systemone' || decision.engine === 'laya') {
        confStr = ` (${decision.confidence}% prob)`;
      } else if (decision.engine === 'vector') {
        confStr = ` (${decision.confidence}% match)`;
      } else {
        confStr = ` (${decision.confidence}%)`;
      }
    }

    let probBreakdown = '';
    if (decision.probabilities && Object.keys(decision.probabilities).length > 0) {
      probBreakdown = ' [' + Object.entries(decision.probabilities)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([cat, p]) => `${cat} ${Math.round(p * 100)}%`)
        .join(', ') + ']';
    }

    indicatorText = `${icon}${decision.category}${confStr} → ${decision.model}${probBreakdown}`;
    indicatorColor = decision.color || '#06b6d4';
    indicatorTooltip = decision.explanation || '';
    if (decision.probabilities) {
      indicatorTooltip += '\nProbability breakdown:\n' + Object.entries(decision.probabilities)
        .sort((a, b) => b[1] - a[1])
        .map(([c, p]) => `  ${c}: ${(p * 100).toFixed(1)}%`)
        .join('\n');
    }
  } else if (decision?.model) {
    indicatorText = decision.model;
    indicatorTooltip = decision.explanation || '';
  }

  return (
    <div
      className="input-area"
      id="input-area-zone"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="input-area__inner">
        <AttachmentBar />

        {isDragging && (
          <div className="drag-drop-overlay" style={{ display: 'flex' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined">upload_file</span>
              Drop files (PDF, JSON, Docs for RAG, or Images for Vision)
            </span>
          </div>
        )}

        <div className="input-area__wrapper">
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept="*/*"
            multiple
            onChange={(e) => {
              if (e.target.files) {
                onFilesSelected(e.target.files);
                e.target.value = '';
              }
            }}
          />

          <button
            className="input-area__attach"
            onClick={() => fileInputRef.current?.click()}
            title="Attach files (PDF, JSON, Docs, Code, or Images)"
          >
            <span className="material-symbols-outlined">attach_file</span>
          </button>

          <textarea
            id="chat-input"
            ref={textareaRef}
            className="input-area__textarea"
            placeholder="Type your message… (queries are auto-routed)"
            rows={1}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={onPaste}
          />

          {isStreaming ? (
            <button
              id="btn-stop"
              className="input-area__send"
              onClick={onStopStreaming}
              title="Stop generation"
              style={{ color: 'var(--error)' }}
            >
              <span className="material-symbols-outlined">stop</span>
            </button>
          ) : (
            <button
              id="btn-send"
              className="input-area__send"
              onClick={onSendMessage}
              disabled={!canSend}
              title="Send message"
            >
              <span className="material-symbols-outlined">send</span>
            </button>
          )}
        </div>

        <div className="input-area__footer">
          <span className="routing-indicator" title={indicatorTooltip}>
            <span
              className="routing-indicator__dot"
              style={{ background: indicatorColor || undefined }}
            ></span>
            Route: <strong>{indicatorText}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
