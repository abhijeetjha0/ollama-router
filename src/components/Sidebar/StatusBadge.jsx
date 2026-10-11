import React from 'react';

export function StatusBadge({ status }) {
  const texts = {
    checking: 'Checking Ollama…',
    online: 'Ollama Connected',
    offline: 'Ollama Offline',
  };

  return (
    <div className={`status-badge status-badge--${status || 'checking'}`}>
      <span className="status-badge__dot"></span>
      <span className="status-badge__text">{texts[status] || 'Checking Ollama…'}</span>
    </div>
  );
}
