import React from 'react';
import { useStore } from '../../context/StoreContext.jsx';
import { RouteCard } from './RouteCard.jsx';

export function RoutingTab({ onOpenAddRoute, onOpenEditRoute }) {
  const { state, store } = useStore();

  const mode = state.routingMode || 'vector';
  const routerModel = state.routerModel || '';
  const embeddingModel = state.embeddingModel || '';
  const defaultModel = state.defaultModel || '';
  const guardrailsEnabled = state.guardrailsEnabled !== false;

  const models = state.availableModels || [];
  const chatModels = models.filter(m => m.isChatModel);
  const decisionModels = models.filter(m => m.isDecisionModel);
  const embeddingModels = models.filter(m => m.isEmbeddingModel);

  const validChat = chatModels.length > 0
    ? chatModels
    : models.filter(m => !m.isDecisionModel && !m.isEmbeddingModel);

  const validDecision = decisionModels.length > 0 ? decisionModels : models;
  const validEmbedding = embeddingModels.length > 0
    ? embeddingModels
    : models.filter(m => m.name.toLowerCase().includes('embed') || m.isEmbeddingModel);

  // Engine card details by mode
  let engineIcon = 'hub';
  let engineName = 'Vector Semantic';
  let engineSub = embeddingModel ? `${embeddingModel} (Embeddings)` : 'No embedding model configured';
  let badgeText = 'Active (Vector)';
  let badgeStyle = { background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8' };

  if (state.ollamaStatus === 'offline') {
    badgeText = 'Offline';
    badgeStyle = { background: 'rgba(239, 68, 68, 0.2)', color: 'var(--error)' };
  } else if (mode === 'systemone') {
    engineIcon = 'psychology';
    engineName = 'System 1 Classifier';
    engineSub = routerModel ? `${routerModel} (System 1)` : 'System 1 Decision';
    badgeText = 'Active (AI)';
    badgeStyle = {};
  } else if (mode === 'hybrid') {
    engineIcon = 'bolt';
    engineName = 'Hybrid Router';
    engineSub = 'Vector + System 1 + Keywords';
    badgeText = 'Active (AI)';
    badgeStyle = {};
  } else if (mode === 'keywords') {
    engineIcon = 'label';
    engineName = 'Keywords Matcher';
    engineSub = 'Lexical Rules';
    badgeText = 'Keywords';
    badgeStyle = { background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b' };
  }

  const routes = state.routes || [];

  return (
    <div className="sidebar__panel sidebar__panel--active">
      {/* Router Engine Card */}
      <div className="router-engine-card">
        <div className="router-engine-card__header">
          <div className="router-engine-card__title">
            <span className="material-symbols-outlined router-engine-card__icon">{engineIcon}</span>
            <div>
              <div className="router-engine-card__name">{engineName}</div>
              <div className="router-engine-card__sub">{engineSub}</div>
            </div>
          </div>
          <span className="badge badge--success" style={badgeStyle}>
            {badgeText}
          </span>
        </div>

        <div className="router-engine-card__row">
          <label htmlFor="routing-mode-select">Routing Mode:</label>
          <select
            id="routing-mode-select"
            className="select select--sm"
            value={mode === 'laya' ? 'systemone' : mode}
            onChange={(e) => store.update({ routingMode: e.target.value })}
          >
            <option value="vector">Vector Embeddings (Semantic)</option>
            <option value="systemone">System 1 Classifier (AI)</option>
            <option value="hybrid">Hybrid (Vector + System 1 + Keys)</option>
            <option value="keywords">Keywords Only</option>
          </select>
        </div>

        {(mode === 'vector' || mode === 'hybrid') && (
          <div className="router-engine-card__row">
            <label htmlFor="embedding-model-select">Embedding Model:</label>
            <select
              id="embedding-model-select"
              className="select select--sm"
              value={embeddingModel}
              onChange={(e) => store.update({ embeddingModel: e.target.value })}
            >
              {validEmbedding.length > 0 ? (
                validEmbedding.map(m => (
                  <option key={m.name} value={m.name}>
                    🧬 {m.name}
                  </option>
                ))
              ) : (
                <option value="">No embedding models detected</option>
              )}
            </select>
          </div>
        )}

        {(mode === 'systemone' || mode === 'hybrid') && (
          <div className="router-engine-card__row">
            <label htmlFor="router-model-select">Decision Model:</label>
            <select
              id="router-model-select"
              className="select select--sm"
              value={routerModel}
              onChange={(e) => store.update({ routerModel: e.target.value })}
            >
              {validDecision.length > 0 ? (
                validDecision.map(m => (
                  <option key={m.name} value={m.name}>
                    🧠 {m.name} {m.isDecisionModel ? '(System 1)' : ''}
                  </option>
                ))
              ) : (
                <option value="">None available</option>
              )}
            </select>
          </div>
        )}
      </div>

      {/* Guardrails Card */}
      <div className="guardrails-card">
        <div className="guardrails-card__header">
          <div className="guardrails-card__title">
            <span className="material-symbols-outlined guardrails-card__icon">shield</span>
            <div>
              <div className="guardrails-card__name">Semantic Guardrails</div>
              <div className="guardrails-card__sub">Prompt Injection & Threat Filter</div>
            </div>
          </div>
          <label className="switch" title="Toggle Guardrails">
            <input
              type="checkbox"
              checked={guardrailsEnabled}
              onChange={(e) => store.updateGuardrails(state.guardrails, e.target.checked)}
            />
            <span className="slider"></span>
          </label>
        </div>
      </div>

      {/* Routing Rules Header */}
      <div className="panel-header">
        <h3>Routing Rules</h3>
        <button className="btn btn--sm btn--ghost" onClick={onOpenAddRoute}>
          <span className="material-symbols-outlined">add</span>
          Add
        </button>
      </div>

      {/* Routing Rules List */}
      <div className="routing-rules-list">
        {routes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">
              <span className="material-symbols-outlined">alt_route</span>
            </div>
            <div className="empty-state__text">
              No routing rules defined.<br />Add your first rule!
            </div>
          </div>
        ) : (
          routes.map(r => (
            <RouteCard
              key={r.id}
              route={r}
              onEdit={onOpenEditRoute}
              onDelete={(id) => store.deleteRoute(id)}
            />
          ))
        )}
      </div>

      {/* Panel Footer: Default Chat Model */}
      <div className="panel-footer">
        <div className="default-model-select">
          <label htmlFor="default-model">Default Chat Model (fallback):</label>
          <select
            id="default-model"
            className="select"
            value={defaultModel}
            onChange={(e) => store.update({ defaultModel: e.target.value })}
          >
            {validChat.length > 0 ? (
              validChat.map(m => (
                <option key={m.name} value={m.name}>
                  {m.name} {m.isCodeModel ? '(Code)' : m.isVisionModel ? '(Vision)' : m.isFunctionModel ? '(Tools)' : `(${m.parameterSize || 'Chat'})`}
                </option>
              ))
            ) : (
              <option value="">No chat models available</option>
            )}
          </select>
        </div>
      </div>
    </div>
  );
}
