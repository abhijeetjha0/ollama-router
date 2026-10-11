import React from 'react';
import { formatDuration } from '../../utils.js';

export function ChatHeader({
  activeConversation,
  latestDecision,
  latestMetrics,
}) {
  const title = activeConversation?.title || 'New Conversation';

  // Last assistant message from conversation or latest metrics
  const lastAssistant = [...(activeConversation?.messages || [])]
    .reverse()
    .find(m => m.role === 'assistant');

  const model = latestMetrics?.model || lastAssistant?.model || '—';
  const time = latestMetrics?.responseTime || lastAssistant?.responseTime
    ? formatDuration(latestMetrics?.responseTime || lastAssistant?.responseTime)
    : '—';
  const tokens = latestMetrics?.tokens || lastAssistant?.tokens
    ? (latestMetrics?.tokens || lastAssistant?.tokens).toLocaleString()
    : '—';

  // Routing decision badge
  const decision = latestDecision || (lastAssistant ? {
    category: lastAssistant.routeCategory,
    confidence: lastAssistant.routeConfidence,
    engine: lastAssistant.routingEngine,
    probabilities: lastAssistant.probabilities,
  } : null);

  let badge = null;
  if (decision && decision.category && decision.category !== 'fallback') {
    let icon = '🏷️ ';
    if (decision.engine === 'vector') icon = '🧬 Vector ⟶ ';
    else if (decision.engine === 'systemone' || decision.engine === 'laya') icon = '🧠 System 1 ⟶ ';
    else if (decision.engine === 'vision') icon = '👁️ Vision ⟶ ';

    const conf = decision.confidence !== undefined && decision.confidence !== null
      ? (decision.engine === 'systemone' || decision.engine === 'laya'
          ? ` (${decision.confidence}% prob)`
          : ` (${decision.confidence}%)`)
      : '';

    let probBreakdown = '';
    if (decision.probabilities && Object.keys(decision.probabilities).length > 0) {
      probBreakdown = ' [' + Object.entries(decision.probabilities)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([cat, p]) => `${cat} ${Math.round(p * 100)}%`)
        .join(', ') + ']';
    }

    let tooltip = decision.explanation || `${decision.category}${conf}`;
    if (decision.probabilities) {
      tooltip += '\nProbabilities:\n' + Object.entries(decision.probabilities)
        .sort((a, b) => b[1] - a[1])
        .map(([c, p]) => `  ${c}: ${(p * 100).toFixed(1)}%`)
        .join('\n');
    }

    badge = (
      <span
        id="chat-route-badge"
        className="route-badge"
        style={{
          background: `${decision.color || '#6366f1'}20`,
          color: decision.color || '#6366f1',
        }}
        title={tooltip}
      >
        {icon}{decision.category}{conf}{probBreakdown}
      </span>
    );
  }

  return (
    <div id="chat-header" className="chat-header">
      <div className="chat-header__info">
        <h2 id="chat-title" className="chat-header__title">{title}</h2>
        {badge}
      </div>
      <div className="chat-header__actions">
        <div id="metrics-bar" className="metrics-bar">
          <div className="metric" title="Response time">
            <span className="material-symbols-outlined">schedule</span>
            <span id="metric-time">{time}</span>
          </div>
          <div className="metric" title="Tokens used">
            <span className="material-symbols-outlined">token</span>
            <span id="metric-tokens">{tokens}</span>
          </div>
          <div className="metric" title="Model used">
            <span className="material-symbols-outlined">smart_toy</span>
            <span id="metric-model">{model}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
