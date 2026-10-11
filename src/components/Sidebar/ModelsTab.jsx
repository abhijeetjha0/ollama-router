import React from 'react';
import { useStore } from '../../context/StoreContext.jsx';
import { formatSize } from '../../utils.js';

export function ModelsTab({ onRefresh }) {
  const { state } = useStore();
  const models = state.availableModels || [];

  return (
    <div className="sidebar__panel sidebar__panel--active">
      <div className="panel-header">
        <h3>Available Models</h3>
        <button
          className="btn btn--sm btn--ghost"
          onClick={onRefresh}
          title="Refresh models"
        >
          <span className="material-symbols-outlined">refresh</span>
        </button>
      </div>

      <div className="models-list">
        {models.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">
              <span className="material-symbols-outlined">inventory_2</span>
            </div>
            <div className="empty-state__text">
              No models found.<br />Make sure Ollama is running and has models installed.
            </div>
          </div>
        ) : (
          models.map((m) => {
            let roleBadge = <span className="model-badge">Other</span>;

            if (m.isDecisionModel) {
              roleBadge = (
                <span className="model-badge model-badge--decision">
                  <span className="material-symbols-outlined" style={{ fontSize: 12, marginRight: 3 }}>
                    psychology
                  </span>
                  Decision (System 1)
                </span>
              );
            } else if (m.isEmbeddingModel) {
              roleBadge = (
                <span className="model-badge model-badge--embedding">
                  <span className="material-symbols-outlined" style={{ fontSize: 12, marginRight: 3 }}>
                    hub
                  </span>
                  Embeddings
                </span>
              );
            } else if (m.isFunctionModel) {
              roleBadge = (
                <span className="model-badge model-badge--function">
                  <span className="material-symbols-outlined" style={{ fontSize: 12, marginRight: 3 }}>
                    build
                  </span>
                  Function / Tools
                </span>
              );
            } else if (m.isCodeModel) {
              roleBadge = (
                <span className="model-badge model-badge--code">
                  <span className="material-symbols-outlined" style={{ fontSize: 12, marginRight: 3 }}>
                    terminal
                  </span>
                  Code LLM
                </span>
              );
            } else if (m.isVisionModel) {
              roleBadge = (
                <span className="model-badge model-badge--vision">
                  <span className="material-symbols-outlined" style={{ fontSize: 12, marginRight: 3 }}>
                    visibility
                  </span>
                  Vision LLM
                </span>
              );
            } else if (m.isChatModel) {
              roleBadge = (
                <span className="model-badge model-badge--chat">
                  <span className="material-symbols-outlined" style={{ fontSize: 12, marginRight: 3 }}>
                    chat
                  </span>
                  Chat LLM
                </span>
              );
            }

            return (
              <div key={m.name} className="model-card">
                <div className="model-card__header">
                  <div className="model-card__name">{m.name}</div>
                  {roleBadge}
                </div>
                <div className="model-card__details">
                  {m.developer && (
                    <span className="model-card__pill model-card__pill--dev">
                      {m.developer}
                    </span>
                  )}
                  <span>{formatSize(m.size)}</span>
                  {m.parameterSize && m.parameterSize !== '—' && (
                    <span>{m.parameterSize}</span>
                  )}
                  {m.quantization && m.quantization !== '—' && (
                    <span>{m.quantization}</span>
                  )}
                  {m.contextTokensText && (
                    <span className="model-card__pill model-card__pill--ctx">
                      {m.contextTokensText}
                    </span>
                  )}
                  {m.runner && (
                    <span className="model-card__pill model-card__pill--runner">
                      {m.runner}
                    </span>
                  )}
                  {m.family && m.family !== 'unknown' && (
                    <span>{m.family}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
