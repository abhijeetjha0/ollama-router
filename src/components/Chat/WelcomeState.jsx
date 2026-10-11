import React from 'react';

export function WelcomeState({ onSelectPrompt }) {
  const chips = [
    { label: '💻 Code task', prompt: 'Write a Python function to sort a list' },
    { label: '✨ Creative writing', prompt: 'Write a haiku about the ocean at midnight' },
    { label: '🧠 General knowledge', prompt: 'Explain quantum entanglement in simple terms' },
    { label: '📊 Analysis', prompt: 'Analyze the pros and cons of microservices vs monolith' },
  ];

  return (
    <div id="welcome-state" className="welcome-state">
      <div className="welcome-state__icon">
        <span className="material-symbols-outlined" style={{ fontSize: 28 }}>
          alt_route
        </span>
      </div>
      <h2>Ready to Route</h2>
      <p>
        Your queries will be automatically routed to the best model based on your routing rules.
        Configure routes in the sidebar, then start chatting.
      </p>
      <div className="welcome-state__chips">
        {chips.map((chip, idx) => (
          <button
            key={idx}
            className="chip"
            onClick={() => onSelectPrompt(chip.prompt)}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}
