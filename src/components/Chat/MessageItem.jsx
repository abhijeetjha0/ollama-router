import React from 'react';
import { formatDuration, formatMarkdown } from '../../utils.js';

export function MessageItem({ message, isGenerating = false, streamingContent = null }) {
  const isUser = message.role === 'user';
  const isGuardrail = message.routingEngine === 'guardrail';

  const metaInfo = [];
  if (message.model) metaInfo.push(message.model);
  if (message.responseTime) metaInfo.push(formatDuration(message.responseTime));
  if (message.tokens) metaInfo.push(`${message.tokens} tokens`);

  if (message.routeCategory && message.routeCategory !== 'fallback') {
    let icon = '🏷️ ';
    if (message.routingEngine === 'vector') icon = '🧬 Vector ⟶ ';
    else if (message.routingEngine === 'systemone' || message.routingEngine === 'laya') icon = '🧠 System 1 ⟶ ';
    else if (message.routingEngine === 'vision') icon = '👁️ Vision ⟶ ';
    else if (message.routingEngine === 'guardrail') icon = '🛡️ ';

    let conf = '';
    if (message.routeConfidence !== undefined && message.routeConfidence !== null) {
      conf = (message.routingEngine === 'systemone' || message.routingEngine === 'laya')
        ? ` (${message.routeConfidence}% prob)`
        : ` (${message.routeConfidence}%)`;
    }

    let probBreakdown = '';
    if (message.probabilities && Object.keys(message.probabilities).length > 0) {
      probBreakdown = ' [' + Object.entries(message.probabilities)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([c, p]) => `${c}: ${Math.round(p * 100)}%`)
        .join(', ') + ']';
    }

    metaInfo.push(`${icon}${message.routeCategory}${conf}${probBreakdown}`);
  }

  if (isGenerating) {
    metaInfo.push('Generating…');
  }

  const thumbs = message.imageThumbnails || (message.images ? message.images.map(b64 => `data:image/png;base64,${b64}`) : []);

  // Use active streaming content if currently generating; otherwise stored message content
  const rawContent = isGenerating && streamingContent !== null
    ? streamingContent
    : (message.content || '');

  return (
    <div className={`message message--${message.role} ${isGuardrail ? 'message--guardrail' : ''}`}>
      <div className="message__body">
        {thumbs.length > 0 && (
          <div className="message__images">
            {thumbs.map((src, i) => (
              <img key={i} src={src} className="message__image-thumb" alt="Uploaded thumbnail" />
            ))}
          </div>
        )}
        <div className="message__bubble">
          {rawContent ? (
            <span dangerouslySetInnerHTML={{ __html: formatMarkdown(rawContent) }} />
          ) : isGenerating ? (
            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Generating response…</span>
          ) : null}
          {isGenerating && <span className="message__cursor"></span>}
        </div>
        {metaInfo.length > 0 && (
          <div className="message__meta">{metaInfo.join(' · ')}</div>
        )}
      </div>
    </div>
  );
}
