/**
 * Ollama Router — Main Application
 * 
 * Orchestrates Store, Router, Ollama Client, Vector Search, Mini-RAG, and all UI views.
 * Bridges Vector Embeddings (e.g. embeddinggemma-2), System 1 decision encoders, and local generative LLMs.
 */

import './style.css';
import { store, DEFAULT_ROUTES } from './store.js';
import { ollama } from './ollama.js';
import { router } from './router.js';
import { processDocumentFile, retrieveRelevantChunks, formatRAGContext } from './rag.js';
import { cosineSimilarity, embeddingCache } from './vector.js';
import { formatSize, formatDuration, formatRelativeTime, formatMarkdown, escapeHtml, debounce } from './utils.js';

// ─── DOM References ───
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const DOM = {
  ollamaStatus: $('#ollama-status'),
  statusText: $('#ollama-status .status-badge__text'),

  // Sidebar tabs & panels
  sidebarTabs: $$('.sidebar__tab'),
  panels: {
    conversations: $('#panel-conversations'),
    routing: $('#panel-routing'),
    models: $('#panel-models'),
  },

  // Conversations & Search
  btnNewChat: $('#btn-new-chat'),
  chatSearchInput: $('#chat-search-input'),
  btnClearSearch: $('#btn-clear-search'),
  conversationList: $('#conversation-list'),

  // Router Engine Card
  routerEngineIcon: $('#router-engine-icon'),
  routerEngineName: $('#router-engine-name'),
  routerEngineBadge: $('#router-engine-badge'),
  routerEngineModelLabel: $('#router-engine-model-label'),
  routingModeSelect: $('#routing-mode-select'),
  embeddingModelSelect: $('#embedding-model-select'),
  embeddingModelRow: $('#embedding-model-row'),
  routerModelSelect: $('#router-model-select'),
  routerModelRow: $('#router-model-row'),
  guardrailsToggle: $('#guardrails-toggle'),

  // Routing Rules
  routingRulesList: $('#routing-rules-list'),
  btnAddRoute: $('#btn-add-route'),
  defaultModelSelect: $('#default-model'),

  // Models
  modelsList: $('#models-list'),
  btnRefreshModels: $('#btn-refresh-models'),

  // Chat
  chatTitle: $('#chat-title'),
  chatRouteBadge: $('#chat-route-badge'),
  messagesContainer: $('#messages-container'),
  messages: $('#messages'),
  welcomeState: $('#welcome-state'),
  inputAreaZone: $('#input-area-zone'),
  attachedImagesContainer: $('#attached-images-container'),
  attachedDocsContainer: $('#attached-docs-container'),
  dragDropOverlay: $('#drag-drop-overlay'),
  fileInput: $('#file-input'),
  btnAttachFile: $('#btn-attach-file'),
  chatInput: $('#chat-input'),
  btnSend: $('#btn-send'),
  routingIndicatorModel: $('#routing-indicator-model'),

  // Metrics
  metricTime: $('#metric-time'),
  metricTokens: $('#metric-tokens'),
  metricModel: $('#metric-model'),

  // Settings Modal
  btnSettings: $('#btn-settings'),
  settingsModal: $('#settings-modal'),
  btnCloseSettings: $('#btn-close-settings'),
  btnSaveSettings: $('#btn-save-settings'),
  ollamaUrl: $('#ollama-url'),
  systemPrompt: $('#system-prompt'),
  temperature: $('#temperature'),
  tempValue: $('#temp-value'),
  streamToggle: $('#stream-toggle'),

  // Route Modal
  routeModal: $('#route-modal'),
  routeModalTitle: $('#route-modal-title'),
  btnCloseRoute: $('#btn-close-route'),
  btnCancelRoute: $('#btn-cancel-route'),
  btnSaveRoute: $('#btn-save-route'),
  routeCategory: $('#route-category'),
  routeDesc: $('#route-desc'),
  routeKeywords: $('#route-keywords'),
  routeModel: $('#route-model'),
  routeOverlapAlert: $('#route-overlap-alert'),
  colorSwatches: $$('.color-swatch'),
};

// ─── State variables ───
let isStreaming = false;
let abortController = null;
let selectedRouteColor = '#6366f1';
let searchFilterQuery = '';

// ═══════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════

async function init() {
  // Check Ollama status & load models
  await checkOllamaAndLoadModels();

  // Load active conversation & attached documents
  renderConversationList();
  renderActiveConversation();
  renderAttachedDocuments();

  // Bind all event listeners
  bindEvents();
}

async function checkOllamaAndLoadModels() {
  updateStatusBadge('checking');

  const online = await ollama.checkHealth();

  if (online) {
    updateStatusBadge('online');
    store.update({ ollamaStatus: 'online' });

    const models = await ollama.listModels();
    store.update({ availableModels: models });

    // Determine available models by role
    const chatModels = models.filter(m => m.isChatModel);
    const decisionModels = models.filter(m => m.isDecisionModel);
    const embeddingModels = models.filter(m => m.isEmbeddingModel);
    const visionModels = models.filter(m => m.isVisionModel);

    // Auto-select defaults if not set
    let defaultModel = store.state.defaultModel;
    if (!defaultModel || !chatModels.some(m => m.name === defaultModel)) {
      defaultModel = chatModels[0]?.name || '';
    }

    let embeddingModel = store.state.embeddingModel;
    if (!embeddingModel || !embeddingModels.some(m => m.name === embeddingModel)) {
      embeddingModel = embeddingModels.find(m => m.name.includes('gemma'))?.name 
        || embeddingModels[0]?.name 
        || 'embeddinggemma-2:latest';
    }

    // Auto-assign models to routes that lack a valid chat model
    let currentRoutes = store.state.routes;
    if (!Array.isArray(currentRoutes) || currentRoutes.length === 0) {
      currentRoutes = JSON.parse(JSON.stringify(DEFAULT_ROUTES));
    }

    const routes = currentRoutes.map(r => {
      if (!r.model || (chatModels.length > 0 && !chatModels.some(m => m.name === r.model))) {
        let assigned = defaultModel;
        const cat = r.category.toLowerCase();
        if (cat.includes('code')) {
          assigned = chatModels.find(m => m.name.includes('coder') || m.name.includes('code'))?.name || defaultModel;
        } else if (cat.includes('creative')) {
          assigned = chatModels.find(m => m.name.includes('mistral') || m.name.includes('llama'))?.name || defaultModel;
        } else if (cat.includes('math')) {
          assigned = chatModels.find(m => m.name.includes('deepseek') || m.name.includes('qwen'))?.name || defaultModel;
        } else if (cat.includes('vision') || cat.includes('multimodal') || cat.includes('image')) {
          assigned = visionModels[0]?.name || chatModels.find(m => m.name.includes('vl'))?.name || defaultModel;
        }
        return { ...r, model: assigned };
      }
      return r;
    });

    store.update({
      defaultModel,
      embeddingModel,
      routes,
    });

    populateModelSelects(models, chatModels, decisionModels, embeddingModels);
    renderModelsList();
    renderRoutingRules();
    updateRouterEngineUI();
  } else {
    updateStatusBadge('offline');
    store.update({ availableModels: [], ollamaStatus: 'offline' });
    updateRouterEngineUI();
  }
}

function updateStatusBadge(status) {
  DOM.ollamaStatus.className = `status-badge status-badge--${status}`;
  const texts = {
    checking: 'Checking Ollama…',
    online: 'Ollama Connected',
    offline: 'Ollama Offline',
  };
  DOM.statusText.textContent = texts[status];
}

function updateRouterEngineUI() {
  const mode = store.state.routingMode || 'vector';
  const routerModel = store.state.routerModel || '';
  const embeddingModel = store.state.embeddingModel || 'embeddinggemma-2:latest';

  if (DOM.routingModeSelect) {
    DOM.routingModeSelect.value = mode === 'laya' ? 'systemone' : mode;
  }
  if (DOM.guardrailsToggle) {
    DOM.guardrailsToggle.checked = store.state.guardrailsEnabled !== false;
  }

  // Update headers and row visibilities according to mode
  if (mode === 'vector') {
    if (DOM.routerEngineIcon) DOM.routerEngineIcon.textContent = 'hub';
    if (DOM.routerEngineName) DOM.routerEngineName.textContent = 'Vector Semantic';
    if (DOM.routerEngineModelLabel) DOM.routerEngineModelLabel.textContent = `${embeddingModel} (Embeddings)`;
    if (DOM.embeddingModelRow) DOM.embeddingModelRow.style.display = 'flex';
    if (DOM.routerModelRow) DOM.routerModelRow.style.display = 'none';
  } else if (mode === 'systemone' || mode === 'laya') {
    if (DOM.routerEngineIcon) DOM.routerEngineIcon.textContent = 'psychology';
    if (DOM.routerEngineName) DOM.routerEngineName.textContent = 'System 1 Classifier';
    if (DOM.routerEngineModelLabel) DOM.routerEngineModelLabel.textContent = routerModel ? `${routerModel} (System 1)` : 'System 1 Decision';
    if (DOM.embeddingModelRow) DOM.embeddingModelRow.style.display = 'none';
    if (DOM.routerModelRow) DOM.routerModelRow.style.display = 'flex';
  } else if (mode === 'hybrid') {
    if (DOM.routerEngineIcon) DOM.routerEngineIcon.textContent = 'bolt';
    if (DOM.routerEngineName) DOM.routerEngineName.textContent = 'Hybrid Router';
    if (DOM.routerEngineModelLabel) DOM.routerEngineModelLabel.textContent = 'Vector + System 1 + Keywords';
    if (DOM.embeddingModelRow) DOM.embeddingModelRow.style.display = 'flex';
    if (DOM.routerModelRow) DOM.routerModelRow.style.display = 'flex';
  } else {
    // Keywords
    if (DOM.routerEngineIcon) DOM.routerEngineIcon.textContent = 'label';
    if (DOM.routerEngineName) DOM.routerEngineName.textContent = 'Keywords Matcher';
    if (DOM.routerEngineModelLabel) DOM.routerEngineModelLabel.textContent = 'Lexical Rules';
    if (DOM.embeddingModelRow) DOM.embeddingModelRow.style.display = 'none';
    if (DOM.routerModelRow) DOM.routerModelRow.style.display = 'none';
  }

  if (DOM.routerEngineBadge) {
    if (store.state.ollamaStatus === 'offline') {
      DOM.routerEngineBadge.className = 'badge';
      DOM.routerEngineBadge.style.background = 'rgba(239, 68, 68, 0.2)';
      DOM.routerEngineBadge.style.color = 'var(--error)';
      DOM.routerEngineBadge.textContent = 'Offline';
    } else if (mode === 'keywords') {
      DOM.routerEngineBadge.className = 'badge';
      DOM.routerEngineBadge.style.background = 'rgba(245, 158, 11, 0.2)';
      DOM.routerEngineBadge.style.color = '#f59e0b';
      DOM.routerEngineBadge.textContent = 'Keywords';
    } else if (mode === 'vector') {
      DOM.routerEngineBadge.className = 'badge badge--success';
      DOM.routerEngineBadge.style.background = 'rgba(99, 102, 241, 0.2)';
      DOM.routerEngineBadge.style.color = '#818cf8';
      DOM.routerEngineBadge.textContent = 'Active (Vector)';
    } else {
      DOM.routerEngineBadge.className = 'badge badge--success';
      DOM.routerEngineBadge.style.background = '';
      DOM.routerEngineBadge.style.color = '';
      DOM.routerEngineBadge.textContent = 'Active (AI)';
    }
  }
}

function populateModelSelects(models, chatModels = [], decisionModels = [], embeddingModels = []) {
  // 1. Chat models (destination for completions)
  const validChat = chatModels.length > 0
    ? chatModels
    : models.filter(m => !m.isDecisionModel && !m.isEmbeddingModel);

  const chatOptions = validChat.length > 0
    ? validChat.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)} (${m.parameterSize || 'Chat'})</option>`).join('')
    : '<option value="">No chat models available</option>';

  DOM.defaultModelSelect.innerHTML = chatOptions;
  if (store.state.defaultModel) {
    DOM.defaultModelSelect.value = store.state.defaultModel;
  }
  DOM.routeModel.innerHTML = chatOptions;

  // 2. Decision models (System 1)
  const validDecision = decisionModels.length > 0 ? decisionModels : models;
  const decisionOptions = validDecision
    .map(m => `<option value="${escapeHtml(m.name)}">🧠 ${escapeHtml(m.name)} ${m.isDecisionModel ? '(System 1)' : ''}</option>`)
    .join('');

  if (DOM.routerModelSelect) {
    DOM.routerModelSelect.innerHTML = decisionOptions || '<option value="">None available</option>';
    if (store.state.routerModel) {
      DOM.routerModelSelect.value = store.state.routerModel;
    }
  }

  // 3. Embedding models (for Vector Semantic Router & Mini-RAG)
  const validEmbedding = embeddingModels.length > 0 
    ? embeddingModels 
    : models.filter(m => m.name.toLowerCase().includes('embed') || m.isEmbeddingModel);

  const embeddingOptions = validEmbedding.length > 0
    ? validEmbedding.map(m => `<option value="${escapeHtml(m.name)}">🧬 ${escapeHtml(m.name)}</option>`).join('')
    : '<option value="embeddinggemma-2:latest">🧬 embeddinggemma-2:latest</option>';

  if (DOM.embeddingModelSelect) {
    DOM.embeddingModelSelect.innerHTML = embeddingOptions;
    if (store.state.embeddingModel) {
      DOM.embeddingModelSelect.value = store.state.embeddingModel;
    }
  }
}

// ═══════════════════════════════════════════
// SIDEBAR TABS
// ═══════════════════════════════════════════

function switchTab(tabName) {
  DOM.sidebarTabs.forEach(tab => {
    tab.classList.toggle('sidebar__tab--active', tab.dataset.tab === tabName);
  });
  Object.entries(DOM.panels).forEach(([name, panel]) => {
    panel.classList.toggle('sidebar__panel--active', name === tabName);
  });
  store.update({ activeTab: tabName });
}

// ═══════════════════════════════════════════
// CONVERSATIONS & SEMANTIC SEARCH
// ═══════════════════════════════════════════

async function handleSemanticSearch(query) {
  searchFilterQuery = query.trim();

  if (!searchFilterQuery) {
    DOM.btnClearSearch.style.display = 'none';
    renderConversationList();
    return;
  }

  DOM.btnClearSearch.style.display = 'block';

  const conversations = store.state.conversations;
  if (conversations.length === 0) return;

  const embeddingModel = store.state.embeddingModel || 'embeddinggemma-2:latest';
  let queryEmbedding = embeddingCache.get(embeddingModel, searchFilterQuery);

  if (!queryEmbedding) {
    try {
      queryEmbedding = await ollama.embed(embeddingModel, searchFilterQuery);
      if (Array.isArray(queryEmbedding)) {
        embeddingCache.set(embeddingModel, searchFilterQuery, queryEmbedding);
      }
    } catch {
      // Fallback to substring search if embedding fails
      renderFilteredConversations(conversations.filter(c => 
        c.title.toLowerCase().includes(searchFilterQuery.toLowerCase()) ||
        c.messages.some(m => m.content.toLowerCase().includes(searchFilterQuery.toLowerCase()))
      ));
      return;
    }
  }

  // Score each conversation by highest message cosine similarity
  const scoredConversations = [];

  for (const conv of conversations) {
    let maxScore = 0;
    let bestSnippet = '';

    // Check title match
    let titleEmb = embeddingCache.get(embeddingModel, conv.title);
    if (!titleEmb) {
      try {
        titleEmb = await ollama.embed(embeddingModel, conv.title);
        if (Array.isArray(titleEmb)) embeddingCache.set(embeddingModel, conv.title, titleEmb);
      } catch {}
    }
    if (titleEmb) {
      const titleSim = cosineSimilarity(queryEmbedding, titleEmb);
      if (titleSim > maxScore) {
        maxScore = titleSim;
        bestSnippet = conv.title;
      }
    }

    // Check latest 10 messages
    for (const msg of conv.messages.slice(-10)) {
      if (!msg.content || msg.content.length < 5) continue;
      const textToScore = msg.content.slice(0, 300);
      let msgEmb = embeddingCache.get(embeddingModel, textToScore);
      if (!msgEmb) {
        try {
          msgEmb = await ollama.embed(embeddingModel, textToScore);
          if (Array.isArray(msgEmb)) embeddingCache.set(embeddingModel, textToScore, msgEmb);
        } catch {}
      }
      if (msgEmb) {
        const sim = cosineSimilarity(queryEmbedding, msgEmb);
        if (sim > maxScore) {
          maxScore = sim;
          bestSnippet = msg.content.slice(0, 70) + '…';
        }
      }
    }

    if (maxScore > 0.30) {
      scoredConversations.push({
        conv,
        score: maxScore,
        snippet: bestSnippet,
      });
    }
  }

  scoredConversations.sort((a, b) => b.score - a.score);
  renderSemanticSearchResults(scoredConversations);
}

function renderSemanticSearchResults(scoredList) {
  if (scoredList.length === 0) {
    DOM.conversationList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon"><span class="material-symbols-outlined">search</span></div>
        <div class="empty-state__text">No chats matched "${escapeHtml(searchFilterQuery)}"<br>Try different terms.</div>
      </div>`;
    return;
  }

  DOM.conversationList.innerHTML = scoredList.map(({ conv, score, snippet }) => {
    const matchPercent = Math.round(score * 100);
    return `
      <div class="conversation-item ${conv.id === store.state.activeConversationId ? 'conversation-item--active' : ''}" 
           data-id="${conv.id}">
        <div class="conversation-item__icon"><span class="material-symbols-outlined">hub</span></div>
        <div class="conversation-item__content">
          <div class="conversation-item__title">
            ${escapeHtml(conv.title)}
            <span class="decision-pill" style="margin-left: 4px;">${matchPercent}% match</span>
          </div>
          <div class="conversation-item__meta">${escapeHtml(snippet || conv.messages.length + ' msgs')}</div>
        </div>
        <button class="conversation-item__delete" data-delete="${conv.id}" title="Delete conversation">
          <span class="material-symbols-outlined">delete</span>
        </button>
      </div>
    `;
  }).join('');

  bindConversationItemEvents();
}

function renderConversationList() {
  if (searchFilterQuery) {
    handleSemanticSearch(searchFilterQuery);
    return;
  }

  const conversations = store.state.conversations;

  if (conversations.length === 0) {
    DOM.conversationList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon"><span class="material-symbols-outlined">chat</span></div>
        <div class="empty-state__text">No conversations yet.<br>Start a new chat!</div>
      </div>`;
    return;
  }

  DOM.conversationList.innerHTML = conversations.map(conv => `
    <div class="conversation-item ${conv.id === store.state.activeConversationId ? 'conversation-item--active' : ''}" 
         data-id="${conv.id}">
      <div class="conversation-item__icon"><span class="material-symbols-outlined">chat_bubble</span></div>
      <div class="conversation-item__content">
        <div class="conversation-item__title">${escapeHtml(conv.title)}</div>
        <div class="conversation-item__meta">${conv.messages.length} messages · ${formatRelativeTime(conv.updatedAt)}</div>
      </div>
      <button class="conversation-item__delete" data-delete="${conv.id}" title="Delete conversation">
        <span class="material-symbols-outlined">delete</span>
      </button>
    </div>
  `).join('');

  bindConversationItemEvents();
}

function bindConversationItemEvents() {
  DOM.conversationList.querySelectorAll('.conversation-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-delete]')) return;
      store.setActiveConversation(el.dataset.id);
      if (!DOM.chatInput.value.trim()) {
        resetRoutingIndicator();
      }
      renderConversationList();
      renderActiveConversation();
    });
  });

  DOM.conversationList.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isStreaming && abortController) {
        abortController.abort();
        isStreaming = false;
      }
      store.deleteConversation(btn.dataset.delete);
      DOM.chatInput.value = '';
      DOM.chatInput.style.height = 'auto';
      DOM.btnSend.disabled = true;
      resetRoutingIndicator();
      renderConversationList();
      renderActiveConversation();
    });
  });
}

function renderActiveConversation() {
  const conv = store.getActiveConversation();

  if (!conv) {
    DOM.chatTitle.textContent = 'New Conversation';
    DOM.chatRouteBadge.classList.add('route-badge--hidden');
    DOM.metricTime.textContent = '—';
    DOM.metricTokens.textContent = '—';
    DOM.metricModel.textContent = '—';
    DOM.messages.innerHTML = '';
    DOM.messages.appendChild(DOM.welcomeState);
    DOM.welcomeState.style.display = '';
    DOM.chatInput.value = '';
    DOM.chatInput.style.height = 'auto';
    DOM.btnSend.disabled = true;
    resetRoutingIndicator();
    return;
  }

  if (!DOM.chatInput.value.trim() && (store.state.activeImages || []).length === 0) {
    resetRoutingIndicator();
  }

  DOM.chatTitle.textContent = conv.title;

  // Update metrics
  if (conv.avgResponseTime) {
    DOM.metricTime.textContent = formatDuration(conv.avgResponseTime);
  } else {
    DOM.metricTime.textContent = '—';
  }
  if (conv.totalTokens) {
    DOM.metricTokens.textContent = conv.totalTokens.toLocaleString();
  } else {
    DOM.metricTokens.textContent = '—';
  }

  // Render messages
  DOM.messages.innerHTML = '';
  DOM.messages.appendChild(DOM.welcomeState);

  if (conv.messages.length === 0) {
    DOM.welcomeState.style.display = '';
    DOM.chatRouteBadge.classList.add('route-badge--hidden');
    DOM.metricModel.textContent = '—';
  } else {
    DOM.welcomeState.style.display = 'none';
    conv.messages.forEach(msg => {
      DOM.messages.appendChild(createMessageElement(msg));
    });

    const lastAssistant = [...conv.messages].reverse().find(m => m.role === 'assistant');
    if (lastAssistant) {
      DOM.metricModel.textContent = lastAssistant.model || '—';
    }
  }

  scrollToBottom();
}

function createMessageElement(msg) {
  const div = document.createElement('div');
  div.className = `message message--${msg.role}`;
  if (msg.routingEngine === 'guardrail') {
    div.classList.add('message--guardrail');
  }

  const metaInfo = [];
  if (msg.model) metaInfo.push(msg.model);
  if (msg.responseTime) metaInfo.push(formatDuration(msg.responseTime));
  if (msg.tokens) metaInfo.push(`${msg.tokens} tokens`);
  if (msg.routeCategory) {
    let icon = '🏷️ ';
    if (msg.routingEngine === 'vector') icon = '🧬 Vector ⟶ ';
    else if (msg.routingEngine === 'systemone' || msg.routingEngine === 'laya') icon = '🧠 System 1 ⟶ ';
    else if (msg.routingEngine === 'vision') icon = '👁️ Vision ⟶ ';
    else if (msg.routingEngine === 'guardrail') icon = '🛡️ ';
    const conf = (msg.routeConfidence !== undefined && msg.routeConfidence !== null) ? ` (${msg.routeConfidence}%)` : '';
    metaInfo.push(`${icon}${msg.routeCategory}${conf}`);
  }

  let imagesHtml = '';
  const thumbs = msg.imageThumbnails || (msg.images ? msg.images.map(b64 => `data:image/png;base64,${b64}`) : []);
  if (thumbs.length > 0) {
    imagesHtml = `
      <div class="message__images">
        ${thumbs.map(src => `<img src="${src}" class="message__image-thumb" alt="Uploaded image" />`).join('')}
      </div>
    `;
  }

  div.innerHTML = `
    <div class="message__body">
      ${imagesHtml}
      <div class="message__bubble">${formatMarkdown(msg.content)}</div>
      ${metaInfo.length > 0 ? `<div class="message__meta">${metaInfo.join(' · ')}</div>` : ''}
    </div>
  `;

  return div;
}

function createStreamingMessageElement() {
  const div = document.createElement('div');
  div.className = 'message message--assistant';
  div.id = 'streaming-message';

  div.innerHTML = `
    <div class="message__body">
      <div class="message__bubble">
        <span class="message__cursor"></span>
      </div>
      <div class="message__meta">Generating…</div>
    </div>
  `;

  return div;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    DOM.messagesContainer.scrollTop = DOM.messagesContainer.scrollHeight;
  });
}

// ═══════════════════════════════════════════
// MULTIMODAL IMAGES & MINI-RAG DOCUMENTS
// ═══════════════════════════════════════════

async function processImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const base64 = dataUrl.split(',')[1];
      resolve({
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        size: file.size,
        type: file.type,
        dataUrl,
        base64,
        createdAt: Date.now(),
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderAttachedImages() {
  const images = store.state.activeImages || [];
  if (!DOM.attachedImagesContainer) return;
  if (images.length === 0) {
    DOM.attachedImagesContainer.style.display = 'none';
    DOM.attachedImagesContainer.innerHTML = '';
    return;
  }

  DOM.attachedImagesContainer.style.display = 'flex';
  DOM.attachedImagesContainer.innerHTML = images.map(img => `
    <div class="image-chip" data-id="${img.id}">
      <img src="${img.dataUrl}" class="image-chip__thumb" alt="${escapeHtml(img.name)}" />
      <span class="image-chip__name" title="${escapeHtml(img.name)}">${escapeHtml(img.name)}</span>
      <button class="image-chip__remove" data-remove-img="${img.id}" title="Remove image">
        <span class="material-symbols-outlined" style="font-size: 13px;">close</span>
      </button>
    </div>
  `).join('');

  DOM.attachedImagesContainer.querySelectorAll('[data-remove-img]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      store.removeImage(btn.dataset.removeImg);
      renderAttachedImages();
      triggerRoutingPreview();
    });
  });
}

function triggerRoutingPreview() {
  const text = DOM.chatInput.value.trim();
  const hasImages = (store.state.activeImages || []).length > 0;
  DOM.btnSend.disabled = !text && !hasImages;
  const quick = router.quickRoute(text);
  updateRoutingIndicator(quick);
}

function renderAttachedDocuments() {
  const docs = store.state.activeDocuments || [];
  if (docs.length === 0) {
    DOM.attachedDocsContainer.style.display = 'none';
    DOM.attachedDocsContainer.innerHTML = '';
    return;
  }

  DOM.attachedDocsContainer.style.display = 'flex';
  DOM.attachedDocsContainer.innerHTML = docs.map(doc => `
    <div class="doc-chip" data-id="${doc.id}">
      <span class="material-symbols-outlined" style="font-size: 14px;">description</span>
      <span class="doc-chip__name" title="${escapeHtml(doc.name)}">${escapeHtml(doc.name)}</span>
      <span class="doc-chip__chunks">${doc.chunksCount} chunks</span>
      <button class="doc-chip__remove" data-remove-doc="${doc.id}" title="Remove file">
        <span class="material-symbols-outlined" style="font-size: 13px;">close</span>
      </button>
    </div>
  `).join('');

  DOM.attachedDocsContainer.querySelectorAll('[data-remove-doc]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      store.removeDocument(btn.dataset.removeDoc);
      renderAttachedDocuments();
    });
  });
}

async function handleFiles(files) {
  if (!files || files.length === 0) return;
  const embeddingModel = store.state.embeddingModel || 'embeddinggemma-2:latest';

  for (const file of Array.from(files)) {
    try {
      if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)) {
        const img = await processImageFile(file);
        store.addImage(img);
        renderAttachedImages();
        triggerRoutingPreview();
      } else {
        const originalText = DOM.routingIndicatorModel.textContent;
        DOM.routingIndicatorModel.textContent = `Indexing "${file.name}" with ${embeddingModel}…`;

        const doc = await processDocumentFile(file, embeddingModel, (p) => {
          DOM.routingIndicatorModel.textContent = `Indexing "${file.name}" (${p.current}/${p.total} chunks · ${p.percent}%)…`;
        });
        store.addDocument(doc);
        renderAttachedDocuments();

        DOM.routingIndicatorModel.textContent = originalText;
      }
    } catch (err) {
      alert(`Could not process "${file.name}": ${err.message}`);
    }
  }
}

// ═══════════════════════════════════════════
// ROUTING RULES LIST
// ═══════════════════════════════════════════

function renderRoutingRules() {
  const routes = store.state.routes;

  if (routes.length === 0) {
    DOM.routingRulesList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon"><span class="material-symbols-outlined">alt_route</span></div>
        <div class="empty-state__text">No routing rules defined.<br>Add your first rule!</div>
      </div>`;
    return;
  }

  DOM.routingRulesList.innerHTML = routes.map(r => {
    const keywordsHtml = r.keywords && r.keywords.length > 0
      ? `<div class="route-card__keywords">
          ${r.keywords.slice(0, 4).map(k => `<span class="route-card__keyword">${escapeHtml(k)}</span>`).join('')}
          ${r.keywords.length > 4 ? `<span class="route-card__keyword">+${r.keywords.length - 4}</span>` : ''}
        </div>`
      : '';

    return `
      <div class="route-card" data-id="${r.id}" style="border-left: 3px solid ${r.color || '#6366f1'}">
        <div class="route-card__header">
          <div class="route-card__category">
            <span class="route-card__dot" style="background: ${r.color || '#6366f1'}"></span>
            <span class="route-card__name">${escapeHtml(r.category)}</span>
          </div>
          <div class="route-card__actions">
            <button class="route-card__action" data-edit="${r.id}" title="Edit route">
              <span class="material-symbols-outlined">edit</span>
            </button>
            <button class="route-card__action route-card__action--delete" data-delete-route="${r.id}" title="Delete route">
              <span class="material-symbols-outlined">delete</span>
            </button>
          </div>
        </div>
        <div class="route-card__desc">${escapeHtml(r.description || '—')}</div>
        <div class="route-card__model">
          <span class="material-symbols-outlined" style="font-size: 13px;">arrow_forward</span>
          <span>${escapeHtml(r.model || 'No model assigned')}</span>
        </div>
        ${keywordsHtml}
      </div>
    `;
  }).join('');

  DOM.routingRulesList.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openEditRouteModal(btn.dataset.edit));
  });

  DOM.routingRulesList.querySelectorAll('[data-delete-route]').forEach(btn => {
    btn.addEventListener('click', () => {
      store.deleteRoute(btn.dataset.deleteRoute);
      renderRoutingRules();
    });
  });
}

function renderModelsList() {
  const models = store.state.availableModels;

  if (models.length === 0) {
    DOM.modelsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon"><span class="material-symbols-outlined">inventory_2</span></div>
        <div class="empty-state__text">No models found.<br>Make sure Ollama is running and has models installed.</div>
      </div>`;
    return;
  }

  DOM.modelsList.innerHTML = models.map(m => {
    let roleBadge = '<span class="model-badge">Other</span>';
    let roleDesc = '';

    if (m.isVisionModel) {
      roleBadge = '<span class="model-badge model-badge--vision"><span class="material-symbols-outlined" style="font-size: 12px; margin-right: 3px;">visibility</span>Vision LLM</span>';
      roleDesc = '<div class="model-card__role-desc">Multimodal model capable of text generation, image understanding, and visual QA.</div>';
    } else if (m.isDecisionModel) {
      roleBadge = '<span class="model-badge model-badge--decision"><span class="material-symbols-outlined" style="font-size: 12px; margin-right: 3px;">psychology</span>Decision (System 1)</span>';
      roleDesc = '<div class="model-card__role-desc">Non-autoregressive ModernBERT classifier for instant routing.</div>';
    } else if (m.isEmbeddingModel) {
      roleBadge = '<span class="model-badge model-badge--embedding"><span class="material-symbols-outlined" style="font-size: 12px; margin-right: 3px;">hub</span>Embeddings</span>';
      roleDesc = '<div class="model-card__role-desc">Dense vector model used for Vector Semantic Routing & Mini-RAG.</div>';
    } else if (m.isChatModel) {
      roleBadge = '<span class="model-badge model-badge--chat"><span class="material-symbols-outlined" style="font-size: 12px; margin-right: 3px;">chat</span>Chat LLM</span>';
      roleDesc = '<div class="model-card__role-desc">Autoregressive model for conversational text generation.</div>';
    }

    return `
      <div class="model-card">
        <div class="model-card__header">
          <div class="model-card__name">${escapeHtml(m.name)}</div>
          ${roleBadge}
        </div>
        <div class="model-card__details">
          <span>${formatSize(m.size)}</span>
          <span>${m.parameterSize}</span>
          <span>${m.quantization}</span>
          <span>${m.family}</span>
        </div>
        ${roleDesc}
      </div>
    `;
  }).join('');
}

// ═══════════════════════════════════════════
// CHAT & SEND MESSAGE
// ═══════════════════════════════════════════

async function sendMessage() {
  let content = DOM.chatInput.value.trim();
  const activeImages = store.state.activeImages || [];
  if ((!content && activeImages.length === 0) || isStreaming) return;

  if (!content && activeImages.length > 0) {
    content = 'Describe this image in detail and answer any visual questions.';
  }

  if (activeImages.length > 0) {
    const hasVisionModel = (store.state.availableModels || []).some(m => m.isVisionModel);
    if (!hasVisionModel) {
      alert('No vision-capable model (e.g., qwen3-vl:2b or llava) was found in Ollama. Please pull a vision model to analyze images.');
      DOM.btnSend.disabled = false;
      return;
    }
  }

  let conv = store.getActiveConversation();
  if (!conv) {
    conv = store.createConversation();
    renderConversationList();
  }

  DOM.btnSend.disabled = true;
  DOM.routingIndicatorModel.textContent = 'evaluating route…';

  // Evaluate query with Router Engine (Multimodal -> Guardrails -> Vector / System 1 / Keywords)
  const decision = await router.route(content);

  // 1. Check if blocked by Semantic Guardrails
  if (decision.engine === 'guardrail') {
    // Add user message
    const userMsg = { role: 'user', content, timestamp: Date.now() };
    store.addMessage(conv.id, userMsg);
    DOM.messages.appendChild(createMessageElement(userMsg));

    // Clear input
    DOM.chatInput.value = '';
    DOM.chatInput.style.height = 'auto';

    // Add Guardrail block notification
    const guardMsg = {
      role: 'assistant',
      content: `🛡️ **Prompt Intercepted by Semantic Guardrails**\n\nYour message closely matched security policy rule **"${decision.guardrail.name}"** (${decision.confidence}% semantic similarity).\n\n*Rule Description: ${decision.guardrail.description}*`,
      model: 'Guardrails Shield',
      routeCategory: 'Blocked',
      routeConfidence: decision.confidence,
      routingEngine: 'guardrail',
      routeLatency: decision.latencyMs,
      timestamp: Date.now(),
    };
    store.addMessage(conv.id, guardMsg);
    DOM.messages.appendChild(createMessageElement(guardMsg));
    scrollToBottom();

    DOM.btnSend.disabled = false;
    DOM.routingIndicatorModel.textContent = 'blocked';
    renderConversationList();
    return;
  }

  if (!decision.model) {
    alert('No chat or vision-capable model available. Please pull a chat model into Ollama.');
    DOM.btnSend.disabled = false;
    return;
  }

  // Update routing indicator
  updateRoutingIndicator(decision);
  DOM.welcomeState.style.display = 'none';

  const imageBase64s = activeImages.map(img => img.base64);
  const imageDataUrls = activeImages.map(img => img.dataUrl);

  // Add user message with images
  const userMsg = {
    role: 'user',
    content,
    images: imageBase64s.length > 0 ? imageBase64s : undefined,
    imageThumbnails: imageDataUrls.length > 0 ? imageDataUrls : undefined,
    timestamp: Date.now(),
  };
  store.addMessage(conv.id, userMsg);
  DOM.messages.appendChild(createMessageElement(userMsg));
  scrollToBottom();

  // Clear input & active images
  DOM.chatInput.value = '';
  DOM.chatInput.style.height = 'auto';
  store.clearImages();
  renderAttachedImages();

  // 2. Prepare API messages with System Prompt & Mini-RAG Document Context
  let systemPromptText = store.state.settings.systemPrompt;

  // Retrieve relevant chunks from active attached documents
  if (store.state.activeDocuments && store.state.activeDocuments.length > 0) {
    try {
      const relevantChunks = await retrieveRelevantChunks(
        content,
        store.state.activeDocuments,
        store.state.embeddingModel || 'embeddinggemma-2:latest',
        3,
        0.32
      );
      if (relevantChunks.length > 0) {
        systemPromptText += formatRAGContext(relevantChunks);
      }
    } catch (e) {
      console.warn('RAG retrieval failed:', e);
    }
  }

  // Only forward image data if the routed model supports multimodal vision requests.
  // Passing image payloads to text/code models (e.g. qwen2.5-coder) triggers Ollama 400 invalid_request_error.
  const targetModelObj = (store.state.availableModels || []).find(m => m.name === decision.model);
  const isTargetVision = targetModelObj ? targetModelObj.isVisionModel : false;

  const apiMessages = [
    { role: 'system', content: systemPromptText },
    ...conv.messages.map(m => {
      const msgObj = { role: m.role, content: m.content };
      if (isTargetVision && m.images && m.images.length > 0) {
        msgObj.images = m.images;
      }
      return msgObj;
    }),
  ];

  // Update chat header and metrics display
  DOM.metricModel.textContent = decision.model;
  if (decision.category) {
    let icon = '🏷️ ';
    if (decision.engine === 'vector') icon = '🧬 Vector ⟶ ';
    else if (decision.engine === 'systemone' || decision.engine === 'laya') icon = '🧠 System 1 ⟶ ';
    else if (decision.engine === 'vision') icon = '👁️ Vision ⟶ ';

    const conf = (decision.confidence !== undefined && decision.confidence !== null) ? ` (${decision.confidence}%)` : '';
    DOM.chatRouteBadge.textContent = `${icon}${decision.category}${conf}`;
    DOM.chatRouteBadge.style.background = `${decision.color || '#6366f1'}20`;
    DOM.chatRouteBadge.style.color = decision.color || '#6366f1';
    DOM.chatRouteBadge.classList.remove('route-badge--hidden');
    DOM.chatRouteBadge.title = decision.explanation || '';
  }

  const startTime = performance.now();

  if (store.state.settings.streaming) {
    await sendStreamingMessage(conv.id, decision, apiMessages, startTime);
  } else {
    await sendNonStreamingMessage(conv.id, decision, apiMessages, startTime);
  }

  renderConversationList();
}

async function sendStreamingMessage(convId, decision, apiMessages, startTime) {
  isStreaming = true;
  abortController = new AbortController();

  const streamEl = createStreamingMessageElement();
  DOM.messages.appendChild(streamEl);
  scrollToBottom();

  const bubble = streamEl.querySelector('.message__bubble');
  const meta = streamEl.querySelector('.message__meta');
  let fullContent = '';

  store.addMessage(convId, {
    role: 'assistant',
    content: '',
    model: decision.model,
    routeCategory: decision.category,
    routeConfidence: decision.confidence,
    routingEngine: decision.engine,
    routeLatency: decision.latencyMs,
    timestamp: Date.now(),
  });

  try {
    await ollama.chatStream(
      decision.model,
      apiMessages,
      { temperature: store.state.settings.temperature },
      (token) => {
        if (store.getActiveConversation()?.id !== convId) return;
        fullContent += token;
        bubble.innerHTML = formatMarkdown(fullContent) + '<span class="message__cursor"></span>';
        scrollToBottom();
      },
      (finalData) => {
        if (store.getActiveConversation()?.id !== convId) {
          streamEl.remove();
          return;
        }

        const elapsed = performance.now() - startTime;
        const tokens = finalData
          ? (finalData.eval_count || 0) + (finalData.prompt_eval_count || 0)
          : fullContent.split(/\s+/).length;

        bubble.innerHTML = formatMarkdown(fullContent);

        const metaInfo = [decision.model, formatDuration(elapsed), `${tokens} tokens`];
        if (decision.category) {
          let icon = '🏷️ ';
          if (decision.engine === 'vector') icon = '🧬 Vector ⟶ ';
          else if (decision.engine === 'systemone' || decision.engine === 'laya') icon = '🧠 System 1 ⟶ ';
          else if (decision.engine === 'vision') icon = '👁️ Vision ⟶ ';
          const conf = (decision.confidence !== undefined && decision.confidence !== null) ? ` (${decision.confidence}%)` : '';
          metaInfo.push(`${icon}${decision.category}${conf}`);
        }
        meta.textContent = metaInfo.join(' · ');

        store.updateLastAssistantMessage(convId, {
          content: fullContent,
          responseTime: elapsed,
          tokens,
        });

        DOM.metricTime.textContent = formatDuration(elapsed);
        DOM.metricTokens.textContent = tokens.toLocaleString();
        streamEl.removeAttribute('id');
      },
      abortController.signal,
    );
  } catch (e) {
    if (store.getActiveConversation()?.id !== convId) {
      streamEl.remove();
      return;
    }
    if (e.name === 'AbortError') {
      bubble.innerHTML = formatMarkdown(fullContent) + ' <em>(stopped)</em>';
    } else {
      bubble.innerHTML = `<span style="color: var(--error)">Error: ${escapeHtml(e.message)}</span>`;
    }
    store.updateLastAssistantMessage(convId, { content: fullContent || `Error: ${e.message}` });
  } finally {
    isStreaming = false;
    abortController = null;
  }
}

async function sendNonStreamingMessage(convId, decision, apiMessages, startTime) {
  isStreaming = true;

  const typingEl = document.createElement('div');
  typingEl.className = 'typing-indicator';
  typingEl.innerHTML = `
    <div class="typing-indicator__dots">
      <span class="typing-indicator__dot"></span>
      <span class="typing-indicator__dot"></span>
      <span class="typing-indicator__dot"></span>
    </div>
  `;
  DOM.messages.appendChild(typingEl);
  scrollToBottom();

  try {
    const response = await ollama.chat(decision.model, apiMessages, {
      temperature: store.state.settings.temperature,
    });

    const elapsed = performance.now() - startTime;
    const tokens = (response.eval_count || 0) + (response.prompt_eval_count || 0)
      || response.message?.content?.split(/\s+/).length || 0;

    typingEl.remove();

    const assistantMsg = {
      role: 'assistant',
      content: response.message?.content || '',
      model: decision.model,
      routeCategory: decision.category,
      routeConfidence: decision.confidence,
      routingEngine: decision.engine,
      routeLatency: decision.latencyMs,
      responseTime: elapsed,
      tokens,
      timestamp: Date.now(),
    };

    store.addMessage(convId, assistantMsg);
    DOM.messages.appendChild(createMessageElement(assistantMsg));
    scrollToBottom();

    DOM.metricTime.textContent = formatDuration(elapsed);
    DOM.metricTokens.textContent = tokens.toLocaleString();
  } catch (e) {
    typingEl.remove();
    const errMsg = {
      role: 'assistant',
      content: `Error: ${e.message}`,
      model: decision.model,
      timestamp: Date.now(),
    };
    store.addMessage(convId, errMsg);
    DOM.messages.appendChild(createMessageElement(errMsg));
    scrollToBottom();
  } finally {
    isStreaming = false;
  }
}

function updateRoutingIndicator(decision) {
  if (decision && decision.category) {
    let icon = '';
    if (decision.engine === 'vector') icon = '🧬 Vector: ';
    else if (decision.engine === 'systemone' || decision.engine === 'laya') icon = '🧠 System 1: ';
    else if (decision.engine === 'vision') icon = '👁️ Vision: ';
    const confStr = (decision.confidence !== undefined && decision.confidence !== null) ? ` (${decision.confidence}%)` : '';
    DOM.routingIndicatorModel.textContent = `${icon}${decision.category}${confStr} → ${decision.model}`;
    const dot = DOM.routingIndicatorModel.parentElement?.querySelector('.routing-indicator__dot');
    if (dot) dot.style.background = decision.color || '#06b6d4';
  } else {
    DOM.routingIndicatorModel.textContent = decision?.model || 'auto';
    const dot = DOM.routingIndicatorModel.parentElement?.querySelector('.routing-indicator__dot');
    if (dot) dot.style.background = '';
  }
}

function resetRoutingIndicator() {
  const activeImages = store.state.activeImages || [];
  if (activeImages.length > 0) {
    triggerRoutingPreview();
    return;
  }
  DOM.routingIndicatorModel.textContent = 'auto';
  const dot = DOM.routingIndicatorModel.parentElement?.querySelector('.routing-indicator__dot');
  if (dot) dot.style.background = '';
}

// ═══════════════════════════════════════════
// ROUTE MODAL & OVERLAP DETECTOR
// ═══════════════════════════════════════════

function openAddRouteModal() {
  store.update({ editingRouteId: null });
  DOM.routeModalTitle.textContent = 'Add Routing Rule';
  DOM.routeCategory.value = '';
  if (DOM.routeDesc) DOM.routeDesc.value = '';
  DOM.routeKeywords.value = '';
  if (DOM.routeOverlapAlert) DOM.routeOverlapAlert.style.display = 'none';
  selectedRouteColor = '#6366f1';
  updateColorSwatches();

  const chatModels = store.state.availableModels.filter(m => m.isChatModel);
  if (chatModels.length > 0) {
    DOM.routeModel.value = chatModels[0].name;
  }

  DOM.routeModal.showModal();
}

function openEditRouteModal(routeId) {
  const route = store.state.routes.find(r => r.id === routeId);
  if (!route) return;

  store.update({ editingRouteId: routeId });
  DOM.routeModalTitle.textContent = 'Edit Routing Rule';
  DOM.routeCategory.value = route.category;
  if (DOM.routeDesc) DOM.routeDesc.value = route.description || '';
  DOM.routeKeywords.value = (route.keywords || []).join(', ');
  DOM.routeModel.value = route.model;
  if (DOM.routeOverlapAlert) DOM.routeOverlapAlert.style.display = 'none';
  selectedRouteColor = route.color || '#6366f1';
  updateColorSwatches();

  DOM.routeModal.showModal();
}

// Debounced live overlap check when editing a route description
const debouncedCheckOverlap = debounce(async (desc) => {
  if (!desc || desc.trim().length < 5 || !DOM.routeOverlapAlert) {
    if (DOM.routeOverlapAlert) DOM.routeOverlapAlert.style.display = 'none';
    return;
  }

  try {
    const overlaps = await router.checkRouteOverlap(
      desc,
      store.state.routes,
      store.state.editingRouteId,
      store.state.embeddingModel || 'embeddinggemma-2:latest'
    );

    if (overlaps.length > 0 && overlaps[0].similarity >= 65) {
      const top = overlaps[0];
      DOM.routeOverlapAlert.style.display = 'block';
      DOM.routeOverlapAlert.className = 'route-overlap-alert route-overlap-alert--warning';
      DOM.routeOverlapAlert.innerHTML = `⚠️ <strong>High Semantic Overlap (${top.similarity}%)</strong> with existing <strong>"${top.category}"</strong> route. Consider differentiating the description.`;
    } else if (overlaps.length > 0) {
      const top = overlaps[0];
      DOM.routeOverlapAlert.style.display = 'block';
      DOM.routeOverlapAlert.className = 'route-overlap-alert route-overlap-alert--ok';
      DOM.routeOverlapAlert.innerHTML = `✓ Unique description (highest overlap: ${top.similarity}% with "${top.category}").`;
    } else {
      DOM.routeOverlapAlert.style.display = 'none';
    }
  } catch {
    DOM.routeOverlapAlert.style.display = 'none';
  }
}, 300);

function saveRoute() {
  const category = DOM.routeCategory.value.trim();
  const description = DOM.routeDesc ? DOM.routeDesc.value.trim() : '';
  const keywords = DOM.routeKeywords.value.split(',').map(k => k.trim()).filter(Boolean);
  const model = DOM.routeModel.value;

  if (!category) {
    DOM.routeCategory.focus();
    return;
  }

  const routeData = {
    category,
    description: description || `Requests related to ${category}`,
    keywords,
    model,
    color: selectedRouteColor,
  };

  if (store.state.editingRouteId) {
    store.updateRoute(store.state.editingRouteId, routeData);
  } else {
    store.addRoute(routeData);
  }

  DOM.routeModal.close();
  renderRoutingRules();
}

function updateColorSwatches() {
  DOM.colorSwatches.forEach(swatch => {
    swatch.classList.toggle('color-swatch--active', swatch.dataset.color === selectedRouteColor);
  });
}

// ═══════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════

function loadSettingsToUI() {
  const s = store.state.settings;
  DOM.ollamaUrl.value = s.ollamaUrl;
  DOM.systemPrompt.value = s.systemPrompt;
  DOM.temperature.value = s.temperature;
  DOM.tempValue.textContent = s.temperature;
  DOM.streamToggle.checked = s.streaming;
}

function saveSettings() {
  store.updateSettings({
    ollamaUrl: DOM.ollamaUrl.value.trim(),
    systemPrompt: DOM.systemPrompt.value.trim(),
    temperature: parseFloat(DOM.temperature.value),
    streaming: DOM.streamToggle.checked,
  });
  DOM.settingsModal.close();
  checkOllamaAndLoadModels();
}

// ═══════════════════════════════════════════
// EVENT BINDINGS
// ═══════════════════════════════════════════

function bindEvents() {
  // Sidebar tabs
  DOM.sidebarTabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Semantic Search input
  const debouncedSearch = debounce((val) => handleSemanticSearch(val), 250);
  if (DOM.chatSearchInput) {
    DOM.chatSearchInput.addEventListener('input', (e) => {
      debouncedSearch(e.target.value);
    });
  }
  if (DOM.btnClearSearch) {
    DOM.btnClearSearch.addEventListener('click', () => {
      DOM.chatSearchInput.value = '';
      handleSemanticSearch('');
    });
  }

  // Router Engine Controls
  if (DOM.routingModeSelect) {
    DOM.routingModeSelect.addEventListener('change', () => {
      store.update({ routingMode: DOM.routingModeSelect.value });
      updateRouterEngineUI();
    });
  }

  if (DOM.embeddingModelSelect) {
    DOM.embeddingModelSelect.addEventListener('change', () => {
      store.update({ embeddingModel: DOM.embeddingModelSelect.value });
      updateRouterEngineUI();
    });
  }

  if (DOM.routerModelSelect) {
    DOM.routerModelSelect.addEventListener('change', () => {
      store.update({ routerModel: DOM.routerModelSelect.value });
      updateRouterEngineUI();
    });
  }

  if (DOM.guardrailsToggle) {
    DOM.guardrailsToggle.addEventListener('change', (e) => {
      store.updateGuardrails(store.state.guardrails, e.target.checked);
    });
  }

  // Mini-RAG File Attachments
  if (DOM.btnAttachFile && DOM.fileInput) {
    DOM.btnAttachFile.addEventListener('click', () => {
      DOM.fileInput.click();
    });
    DOM.fileInput.addEventListener('change', (e) => {
      handleFiles(e.target.files);
      DOM.fileInput.value = '';
    });
  }

  // Drag and Drop files onto input area
  if (DOM.inputAreaZone && DOM.dragDropOverlay) {
    ['dragenter', 'dragover'].forEach(name => {
      DOM.inputAreaZone.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
        DOM.dragDropOverlay.style.display = 'flex';
      });
    });

    ['dragleave', 'drop'].forEach(name => {
      DOM.inputAreaZone.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
        DOM.dragDropOverlay.style.display = 'none';
      });
    });

    DOM.inputAreaZone.addEventListener('drop', (e) => {
      if (e.dataTransfer?.files?.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    });
  }

  // Live route overlap check
  if (DOM.routeDesc) {
    DOM.routeDesc.addEventListener('input', (e) => {
      debouncedCheckOverlap(e.target.value);
    });
  }

  // New chat
  DOM.btnNewChat.addEventListener('click', () => {
    store.createConversation();
    DOM.chatInput.value = '';
    DOM.chatInput.style.height = 'auto';
    DOM.btnSend.disabled = true;
    resetRoutingIndicator();
    renderConversationList();
    renderActiveConversation();
  });

  // Send message
  DOM.btnSend.addEventListener('click', sendMessage);

  DOM.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Debounced live prediction preview while typing
  const debouncedPredictionPreview = debounce(async (text) => {
    if (!text || DOM.chatInput.value.trim() !== text) return;
    try {
      const decision = await router.route(text);
      if (DOM.chatInput.value.trim() === text) {
        updateRoutingIndicator(decision);
      }
    } catch {}
  }, 250);

  // Auto-resize textarea & live routing preview
  DOM.chatInput.addEventListener('input', () => {
    DOM.chatInput.style.height = 'auto';
    DOM.chatInput.style.height = Math.min(DOM.chatInput.scrollHeight, 160) + 'px';
    const text = DOM.chatInput.value.trim();
    const hasImages = (store.state.activeImages || []).length > 0;
    DOM.btnSend.disabled = !text && !hasImages;

    if (text || hasImages) {
      const quick = router.quickRoute(text);
      updateRoutingIndicator(quick);

      if (store.state.routingMode !== 'keywords' && !hasImages) {
        debouncedPredictionPreview(text);
      }
    } else {
      resetRoutingIndicator();
    }
  });

  // Clipboard paste support for images
  DOM.chatInput.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      handleFiles(imageFiles);
    }
  });

  // Welcome chips
  $$('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      DOM.chatInput.value = chip.dataset.prompt;
      DOM.chatInput.dispatchEvent(new Event('input'));
      DOM.chatInput.focus();
    });
  });

  // Add route
  DOM.btnAddRoute.addEventListener('click', openAddRouteModal);

  // Route modal
  DOM.btnCloseRoute.addEventListener('click', () => DOM.routeModal.close());
  DOM.btnCancelRoute.addEventListener('click', () => DOM.routeModal.close());
  DOM.btnSaveRoute.addEventListener('click', saveRoute);

  // Color swatches
  DOM.colorSwatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      selectedRouteColor = swatch.dataset.color;
      updateColorSwatches();
    });
  });

  // Default model
  DOM.defaultModelSelect.addEventListener('change', () => {
    store.update({ defaultModel: DOM.defaultModelSelect.value });
  });

  // Refresh models
  DOM.btnRefreshModels.addEventListener('click', async () => {
    DOM.btnRefreshModels.classList.add('spinning');
    await checkOllamaAndLoadModels();
    renderRoutingRules();
    setTimeout(() => DOM.btnRefreshModels.classList.remove('spinning'), 500);
  });

  // Settings modal
  DOM.btnSettings.addEventListener('click', () => {
    loadSettingsToUI();
    DOM.settingsModal.showModal();
  });
  DOM.btnCloseSettings.addEventListener('click', () => DOM.settingsModal.close());
  DOM.btnSaveSettings.addEventListener('click', saveSettings);

  // Temperature slider
  DOM.temperature.addEventListener('input', () => {
    DOM.tempValue.textContent = DOM.temperature.value;
  });

  // Close modals on backdrop click
  [DOM.settingsModal, DOM.routeModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.close();
    });
  });
}

// ─── Start application ───
init();

if (typeof window !== 'undefined') {
  window.__router = router;
  window.__handleFiles = handleFiles;
}
