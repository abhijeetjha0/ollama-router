import React, { useState, useEffect } from 'react';
import { useStore } from '../../context/StoreContext.jsx';
import { Modal } from '../Common/Modal.jsx';

export function SettingsModal({ isOpen, onClose, onSaved }) {
  const { state, store } = useStore();

  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [streaming, setStreaming] = useState(true);

  useEffect(() => {
    if (isOpen) {
      const s = state.settings || {};
      setOllamaUrl(s.ollamaUrl || 'http://localhost:11434');
      setSystemPrompt(s.systemPrompt || 'You are a helpful assistant. Provide clear, concise, and accurate responses.');
      setTemperature(s.temperature !== undefined ? s.temperature : 0.7);
      setStreaming(s.streaming !== false);
    }
  }, [isOpen, state.settings]);

  const handleSave = () => {
    store.updateSettings({
      ollamaUrl: ollamaUrl.trim() || 'http://localhost:11434',
      systemPrompt: systemPrompt.trim(),
      temperature: parseFloat(temperature),
      streaming,
    });
    onClose();
    if (onSaved) onSaved();
  };

  const footer = (
    <>
      <button className="btn btn--ghost" onClick={onClose}>
        Cancel
      </button>
      <button className="btn btn--primary" onClick={handleSave}>
        Save Settings
      </button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Settings"
      footer={footer}
    >
      <div className="setting-group">
        <label htmlFor="settings-ollama-url">Ollama Base URL</label>
        <input
          id="settings-ollama-url"
          type="url"
          className="input"
          value={ollamaUrl}
          onChange={(e) => setOllamaUrl(e.target.value)}
        />
      </div>

      <div className="setting-group">
        <label htmlFor="settings-system-prompt">Default System Prompt</label>
        <textarea
          id="settings-system-prompt"
          className="input input--textarea"
          rows={3}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
        />
      </div>

      <div className="setting-group">
        <label htmlFor="settings-temperature">
          Temperature: <span className="temperature-val">{temperature}</span>
        </label>
        <input
          id="settings-temperature"
          type="range"
          min="0"
          max="1"
          step="0.05"
          className="slider-range"
          value={temperature}
          onChange={(e) => setTemperature(parseFloat(e.target.value))}
        />
      </div>

      <div className="setting-group setting-group--inline">
        <div>
          <label htmlFor="settings-stream-toggle">Stream Responses</label>
          <div className="setting-desc">Render tokens as they are generated</div>
        </div>
        <label className="switch">
          <input
            id="settings-stream-toggle"
            type="checkbox"
            checked={streaming}
            onChange={(e) => setStreaming(e.target.checked)}
          />
          <span className="slider"></span>
        </label>
      </div>
    </Modal>
  );
}
