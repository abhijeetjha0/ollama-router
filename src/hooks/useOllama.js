import { useEffect, useCallback } from 'react';
import { useStore } from '../context/StoreContext.jsx';
import { ollama } from '../ollama.js';
import { DEFAULT_ROUTES } from '../store.js';

export function useOllama() {
  const { state, store } = useStore();

  const refreshModels = useCallback(async () => {
    store.update({ ollamaStatus: 'checking' });
    const online = await ollama.checkHealth();

    if (online) {
      store.update({ ollamaStatus: 'online' });
      const models = await ollama.listModels();
      store.update({ availableModels: models });

      const chatModels = models.filter(m => m.isChatModel);
      const codeModels = models.filter(m => m.isCodeModel);
      const decisionModels = models.filter(m => m.isDecisionModel);
      const embeddingModels = models.filter(m => m.isEmbeddingModel);
      const visionModels = models.filter(m => m.isVisionModel);
      const functionModels = models.filter(m => m.isFunctionModel);

      let defaultModel = store.state.defaultModel;
      if (!defaultModel || !chatModels.some(m => m.name === defaultModel)) {
        defaultModel = chatModels[0]?.name || '';
      }

      let routerModel = store.state.routerModel;
      if (!routerModel || !decisionModels.some(m => m.name === routerModel)) {
        routerModel = decisionModels[0]?.name || '';
      }

      let embeddingModel = store.state.embeddingModel;
      if (!embeddingModel || !embeddingModels.some(m => m.name === embeddingModel)) {
        embeddingModel = embeddingModels[0]?.name || '';
      }

      let currentRoutes = store.state.routes;
      if (!Array.isArray(currentRoutes) || currentRoutes.length === 0) {
        currentRoutes = JSON.parse(JSON.stringify(DEFAULT_ROUTES));
      }

      const routes = currentRoutes.map(r => {
        if (!r.model || (chatModels.length > 0 && !chatModels.some(m => m.name === r.model))) {
          let assigned = defaultModel;
          const cat = r.category.toLowerCase();
          if (cat.includes('vision') || cat.includes('multimodal') || cat.includes('image')) {
            assigned = visionModels[0]?.name || defaultModel;
          } else if (cat.includes('code')) {
            assigned = codeModels[0]?.name || defaultModel;
          } else if (cat.includes('creative')) {
            const creativeCandidate = chatModels.find(m => !m.isCodeModel && !m.isVisionModel);
            assigned = creativeCandidate?.name || defaultModel;
          }
          return { ...r, model: assigned };
        }
        return r;
      });

      store.update({
        defaultModel,
        routerModel,
        embeddingModel,
        routes,
      });
    } else {
      store.update({ availableModels: [], ollamaStatus: 'offline' });
    }
  }, [store]);

  useEffect(() => {
    refreshModels();
  }, [refreshModels]);

  const models = state.availableModels || [];
  const chatModels = models.filter(m => m.isChatModel);
  const decisionModels = models.filter(m => m.isDecisionModel);
  const embeddingModels = models.filter(m => m.isEmbeddingModel);
  const visionModels = models.filter(m => m.isVisionModel);
  const functionModels = models.filter(m => m.isFunctionModel);

  return {
    status: state.ollamaStatus,
    models,
    chatModels,
    decisionModels,
    embeddingModels,
    visionModels,
    functionModels,
    refreshModels,
  };
}
