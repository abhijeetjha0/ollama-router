/**
 * Ollama Router — Store (State Management)
 * 
 * Centralized state with localStorage persistence and pub/sub events.
 */

const STORAGE_KEY = 'ollama-router';

export const DEFAULT_ROUTES = [
  {
    id: 'route-code',
    category: 'code',
    description: 'Writing software code, programming languages, debugging scripts, algorithms',
    keywords: ['code', 'function', 'bug', 'error', 'python', 'javascript', 'typescript', 'rust', 'java', 'api', 'debug', 'refactor', 'algorithm', 'class', 'compile', 'import', 'variable', 'loop', 'array', 'html', 'css', 'sql', 'git', 'docker', 'deploy'],
    model: '',
    color: '#6366f1',
  },
  {
    id: 'route-creative',
    category: 'creative',
    description: 'Creative writing, storytelling, poetry, essays, humor, and roleplay',
    keywords: ['write', 'story', 'poem', 'haiku', 'creative', 'fiction', 'essay', 'blog', 'letter', 'script', 'dialogue', 'narrative', 'lyric', 'novel', 'character'],
    model: '',
    color: '#ec4899',
  },
  {
    id: 'route-math',
    category: 'math',
    description: 'Mathematics, arithmetic, calculations, numbers, equations, and math problems',
    keywords: ['math', 'calculate', 'calc', 'arithmetic', 'equation', 'formula', 'integral', 'derivative', 'statistics', 'probability', 'algebra', 'geometry', 'calculus', 'matrix', 'solve', 'addition', 'subtraction', 'multiplication', 'division', '2+2'],
    model: '',
    color: '#10b981',
  },
  {
    id: 'route-analysis',
    category: 'analysis',
    description: 'Comparative analysis, evaluating pros and cons, logical trade-offs',
    keywords: ['analyze', 'compare', 'pros', 'cons', 'tradeoff', 'evaluate', 'review', 'assess', 'benchmark', 'versus', 'difference', 'advantage', 'disadvantage'],
    model: '',
    color: '#f59e0b',
  },
  {
    id: 'route-vision',
    category: 'vision',
    description: 'Visual image understanding, photos, diagrams, OCR, charts, and screenshots',
    keywords: ['image', 'photo', 'picture', 'diagram', 'chart', 'screenshot', 'draw', 'look', 'see', 'ocr', 'visual', 'figure', 'graph'],
    model: '',
    color: '#06b6d4',
  },
];

/** Default security and prompt guardrails */
const DEFAULT_GUARDRAILS = [
  {
    id: 'guard-injection',
    name: 'Prompt Injection & Jailbreak',
    description: 'Ignore previous instructions, bypass safety rules, reveal system prompts, system override, jailbreak, DAN mode',
    threshold: 0.78,
    action: 'block', // 'block' | 'warn'
  },
  {
    id: 'guard-malicious',
    name: 'Harmful & Malicious Code',
    description: 'Create malware, ransomware, exploit payload, keylogger, steal private credentials maliciously',
    threshold: 0.80,
    action: 'block',
  },
];

/** Default application settings */
const DEFAULT_SETTINGS = {
  ollamaUrl: 'http://localhost:11434',
  systemPrompt: 'You are a helpful assistant. Provide clear, concise, and accurate responses.',
  temperature: 0.7,
  streaming: true,
};

/** Initial state shape */
function getInitialState() {
  return {
    // Connection
    ollamaStatus: 'checking', // 'online' | 'offline' | 'checking'
    availableModels: [],

    // Routing
    routes: [...DEFAULT_ROUTES],
    defaultModel: '',
    routerModel: '',
    embeddingModel: '',  // Auto-detected or user-selected; no hardcoded default
    routingMode: 'vector', // 'vector' | 'systemone' | 'hybrid' | 'keywords'

    // Semantic Guardrails
    guardrailsEnabled: true,
    guardrails: [...DEFAULT_GUARDRAILS],

    // Mini-RAG Attached Documents
    activeDocuments: [], // Array of { id, name, size, chunks: [{ text, index, embedding }], createdAt }

    // Multimodal Attached Images
    activeImages: [], // Array of { id, name, size, type, dataUrl, base64, createdAt }

    // Conversations
    conversations: [],
    activeConversationId: null,

    // Settings
    settings: { ...DEFAULT_SETTINGS },

    // UI
    activeTab: 'conversations',
    editingRouteId: null,
  };
}

class Store {
  constructor() {
    this._state = getInitialState();
    this._listeners = new Map();
    this._load();
  }

  /** Get current state */
  get state() {
    return this._state;
  }

  /** Subscribe to state changes */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(callback);
    return () => {
      const cbs = this._listeners.get(event);
      const idx = cbs.indexOf(callback);
      if (idx > -1) cbs.splice(idx, 1);
    };
  }

  /** Emit an event */
  emit(event, data) {
    const cbs = this._listeners.get(event) || [];
    cbs.forEach(cb => cb(data));
  }

  /** Update state and persist */
  update(partial) {
    Object.assign(this._state, partial);
    this._save();
    this.emit('stateChange', this._state);
  }

  // ─── Conversations ───

  createConversation() {
    const conversation = {
      id: `conv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: 'New Conversation',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      totalTokens: 0,
      avgResponseTime: 0,
    };
    this._state.conversations.unshift(conversation);
    this._state.activeConversationId = conversation.id;
    this._save();
    this.emit('conversationCreated', conversation);
    this.emit('stateChange', this._state);
    return conversation;
  }

  getActiveConversation() {
    return this._state.conversations.find(c => c.id === this._state.activeConversationId) || null;
  }

  setActiveConversation(id) {
    this._state.activeConversationId = id;
    this._save();
    this.emit('conversationChanged', id);
    this.emit('stateChange', this._state);
  }

  deleteConversation(id) {
    this._state.conversations = this._state.conversations.filter(c => c.id !== id);
    if (this._state.activeConversationId === id) {
      this._state.activeConversationId = this._state.conversations[0]?.id || null;
    }
    this._save();
    this.emit('conversationDeleted', id);
    this.emit('stateChange', this._state);
  }

  addMessage(conversationId, message) {
    const conv = this._state.conversations.find(c => c.id === conversationId);
    if (!conv) return;

    conv.messages.push(message);
    conv.updatedAt = Date.now();

    // Auto-title from first user message
    if (conv.messages.filter(m => m.role === 'user').length === 1 && message.role === 'user') {
      conv.title = message.content.slice(0, 50) + (message.content.length > 50 ? '…' : '');
    }

    this._save();
    this.emit('messageAdded', { conversationId, message });
    this.emit('stateChange', this._state);
  }

  updateLastAssistantMessage(conversationId, updates) {
    const conv = this._state.conversations.find(c => c.id === conversationId);
    if (!conv) return;

    const lastAssistant = [...conv.messages].reverse().find(m => m.role === 'assistant');
    if (lastAssistant) {
      Object.assign(lastAssistant, updates);
      conv.updatedAt = Date.now();

      // Update metrics
      if (updates.responseTime) {
        const assistantMsgs = conv.messages.filter(m => m.role === 'assistant' && m.responseTime);
        conv.avgResponseTime = assistantMsgs.reduce((sum, m) => sum + m.responseTime, 0) / assistantMsgs.length;
      }
      if (updates.tokens) {
        conv.totalTokens = conv.messages.reduce((sum, m) => sum + (m.tokens || 0), 0);
      }

      this._save();
      this.emit('messageUpdated', { conversationId, message: lastAssistant });
    }
  }

  // ─── Routes ───

  addRoute(route) {
    this._state.routes.push({
      ...route,
      id: `route-${Date.now()}`,
    });
    this._save();
    this.emit('routesChanged', this._state.routes);
    this.emit('stateChange', this._state);
  }

  updateRoute(id, updates) {
    const route = this._state.routes.find(r => r.id === id);
    if (route) {
      Object.assign(route, updates);
      this._save();
      this.emit('routesChanged', this._state.routes);
      this.emit('stateChange', this._state);
    }
  }

  deleteRoute(id) {
    this._state.routes = this._state.routes.filter(r => r.id !== id);
    this._save();
    this.emit('routesChanged', this._state.routes);
    this.emit('stateChange', this._state);
  }

  // ─── Documents (Mini-RAG) ───

  addDocument(doc) {
    this._state.activeDocuments.push(doc);
    this._save();
    this.emit('documentsChanged', this._state.activeDocuments);
    this.emit('stateChange', this._state);
  }

  removeDocument(id) {
    this._state.activeDocuments = this._state.activeDocuments.filter(d => d.id !== id);
    this._save();
    this.emit('documentsChanged', this._state.activeDocuments);
    this.emit('stateChange', this._state);
  }

  clearDocuments() {
    this._state.activeDocuments = [];
    this._save();
    this.emit('documentsChanged', this._state.activeDocuments);
    this.emit('stateChange', this._state);
  }

  // ─── Multimodal Images ───

  addImage(image) {
    this._state.activeImages.push(image);
    this.emit('imagesChanged', this._state.activeImages);
    this.emit('stateChange', this._state);
  }

  removeImage(id) {
    this._state.activeImages = this._state.activeImages.filter(img => img.id !== id);
    this.emit('imagesChanged', this._state.activeImages);
    this.emit('stateChange', this._state);
  }

  clearImages() {
    this._state.activeImages = [];
    this.emit('imagesChanged', this._state.activeImages);
    this.emit('stateChange', this._state);
  }

  // ─── Guardrails ───

  updateGuardrails(guardrails, enabled = this._state.guardrailsEnabled) {
    this._state.guardrails = guardrails;
    this._state.guardrailsEnabled = enabled;
    this._save();
    this.emit('guardrailsChanged', { guardrails: this._state.guardrails, enabled: this._state.guardrailsEnabled });
    this.emit('stateChange', this._state);
  }

  // ─── Settings ───

  updateSettings(settings) {
    Object.assign(this._state.settings, settings);
    this._save();
    this.emit('settingsChanged', this._state.settings);
    this.emit('stateChange', this._state);
  }

  // ─── Persistence ───

  _save() {
    try {
      const data = {
        conversations: this._state.conversations,
        routes: this._state.routes,
        defaultModel: this._state.defaultModel,
        routerModel: this._state.routerModel,
        embeddingModel: this._state.embeddingModel,
        routingMode: this._state.routingMode,
        guardrailsEnabled: this._state.guardrailsEnabled,
        guardrails: this._state.guardrails,
        activeDocuments: this._state.activeDocuments,
        settings: this._state.settings,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save state:', e);
    }
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data.conversations) this._state.conversations = data.conversations;
        if (Array.isArray(data.routes) && data.routes.length > 0) {
          this._state.routes = [...data.routes];
          // Ensure all default routes (e.g. route-vision) exist even if older state was saved
          for (const defRoute of DEFAULT_ROUTES) {
            const existing = this._state.routes.find(r => r.id === defRoute.id || r.category.toLowerCase() === defRoute.category.toLowerCase());
            if (!existing) {
              this._state.routes.push(JSON.parse(JSON.stringify(defRoute)));
            } else {
              // Upgrade legacy math description and keywords so calculations & arithmetic route accurately
              if (defRoute.category === 'math' && !existing.description.toLowerCase().includes('arithmetic')) {
                existing.description = defRoute.description;
                if (!existing.keywords.includes('2+2')) {
                  existing.keywords.push('2+2', 'arithmetic', 'calc', 'addition', 'subtraction', 'multiplication', 'division');
                }
              }
            }
          }
        } else {
          this._state.routes = JSON.parse(JSON.stringify(DEFAULT_ROUTES));
        }
        if (data.defaultModel) this._state.defaultModel = data.defaultModel;
        if (data.routerModel) this._state.routerModel = data.routerModel;
        if (data.embeddingModel) this._state.embeddingModel = data.embeddingModel;
        if (data.routingMode) {
          this._state.routingMode = data.routingMode === 'laya' ? 'systemone' : data.routingMode;
        }
        if (data.guardrailsEnabled !== undefined) this._state.guardrailsEnabled = data.guardrailsEnabled;
        if (data.guardrails) this._state.guardrails = data.guardrails;
        if (data.activeDocuments) this._state.activeDocuments = data.activeDocuments;
        if (data.settings) Object.assign(this._state.settings, data.settings);

        // Sanitize: ensure non-chat models (like decision encoders or embedding models) are not targets for chat completions
        if (this._state.defaultModel && (this._state.defaultModel.toLowerCase().includes('decision') || this._state.defaultModel.toLowerCase().includes('embedding') || this._state.defaultModel.toLowerCase().includes('laya'))) {
          this._state.defaultModel = '';
        }
        if (Array.isArray(this._state.routes)) {
          this._state.routes.forEach(r => {
            if (r.model && (r.model.toLowerCase().includes('decision') || r.model.toLowerCase().includes('embedding') || r.model.toLowerCase().includes('laya'))) {
              r.model = '';
            }
          });
        }

        if (this._state.conversations.length > 0) {
          this._state.activeConversationId = this._state.conversations[0].id;
        }
      }
    } catch (e) {
      console.warn('Failed to load state:', e);
    }
  }
}

export const store = new Store();
if (typeof window !== 'undefined') {
  window.__store = store;
}
