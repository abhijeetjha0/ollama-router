import { useState, useEffect, useRef } from 'react';
import { useStore } from '../context/StoreContext.jsx';
import { router } from '../router.js';

export function useRoutingPreview(inputText) {
  const { state } = useStore();
  const [decision, setDecision] = useState(null);
  const debounceTimerRef = useRef(null);
  const activeImages = state.activeImages || [];
  const routingMode = state.routingMode || 'vector';

  useEffect(() => {
    const text = (inputText || '').trim();
    const hasImages = activeImages.length > 0;

    if (!text && !hasImages) {
      setDecision(null);
      return;
    }

    // 1. Instant synchronous lexical / multimodal quickRoute
    const quick = router.quickRoute(text);
    setDecision(quick);

    // 2. Debounced asynchronous deep routing (Vector / System 1 / Hybrid)
    if (routingMode !== 'keywords' && !hasImages) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(async () => {
        try {
          const deep = await router.route(text);
          setDecision(deep);
        } catch (err) {
          console.warn('Live routing preview error:', err);
        }
      }, 250);
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [inputText, activeImages.length, routingMode, state.routerModel, state.embeddingModel, state.routes]);

  return decision;
}
