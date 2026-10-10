/**
 * Ollama Router — Router Engine
 * 
 * Supports four routing engines & security guardrails:
 * 1. Vector Semantic Routing (Dense embeddings via Ollama /api/embed) — cosine similarity.
 * 2. System 1 Fast Decision Model (via /v1/systemone) — rapid encoder classification.
 * 3. Keyword-based matching — instantaneous local lexical match.
 * 4. Hybrid — Cascade: Guardrails ➔ Vector / System 1 ➔ Keywords ➔ Fallback.
 */

import { store } from './store.js';
import { ollama } from './ollama.js';
import { cosineSimilarity, embeddingCache } from './vector.js';

class Router {
  /**
   * Get all currently available chat-capable models.
   * @returns {Array}
   */
  getChatModels() {
    return (store.state.availableModels || []).filter(m => m.isChatModel);
  }

  /**
   * Get the safe fallback chat model.
   * Never returns a decision model or embedding model.
   * @returns {string}
   */
  getFallbackChatModel() {
    const chatModels = this.getChatModels();
    if (chatModels.length === 0) {
      // If capabilities aren't determined yet, avoid known non-chat models
      const candidates = (store.state.availableModels || []).filter(m => 
        !m.isDecisionModel &&
        !m.isEmbeddingModel &&
        !m.name.toLowerCase().includes('decision') && 
        !m.name.toLowerCase().includes('embedding') &&
        !m.name.toLowerCase().includes('laya')
      );
      return store.state.defaultModel || candidates[0]?.name || '';
    }

    if (store.state.defaultModel && chatModels.some(m => m.name === store.state.defaultModel)) {
      return store.state.defaultModel;
    }

    return chatModels[0]?.name || '';
  }

  /**
   * Route multimodal queries with attached images.
   * If multiple vision models or vision routes exist, intelligently evaluates the prompt text
   * to select the most suitable vision model and rule.
   * 
   * @param {string} query
   * @returns {{ model: string, category: string, color: string, confidence: number, engine: string, explanation: string }}
   */
  routeMultimodal(query) {
    const activeImages = store.state.activeImages || [];
    const visionModels = (store.state.availableModels || []).filter(m => m.isVisionModel);
    const allRoutes = store.state.routes || [];

    // Find all routes that either target a vision model or have a vision-related category
    const visionRoutes = allRoutes.filter(r => 
      (r.model && visionModels.some(vm => vm.name === r.model)) ||
      r.category.toLowerCase().includes('vision')
    );

    // If no vision models installed, fallback to chat model
    if (visionModels.length === 0) {
      const fallback = this.getFallbackChatModel();
      return {
        model: fallback,
        category: 'vision',
        color: '#06b6d4',
        confidence: 50,
        engine: 'vision',
        explanation: `⚠️ No vision model found; fallback to ${fallback}`,
      };
    }

    // Default primary vision route and target model
    const primaryRoute = visionRoutes.find(r => r.category.toLowerCase() === 'vision') || visionRoutes[0];
    let defaultVisionModel = primaryRoute?.model;
    if (!defaultVisionModel || !visionModels.some(vm => vm.name === defaultVisionModel)) {
      defaultVisionModel = visionModels[0].name;
    }

    // If no text query or only 1 vision model and 1 vision route, use default vision target
    if (!query || !query.trim() || (visionModels.length === 1 && visionRoutes.length <= 1)) {
      return {
        model: defaultVisionModel,
        category: primaryRoute?.category || 'vision',
        color: primaryRoute?.color || '#06b6d4',
        confidence: 100,
        engine: 'vision',
        explanation: `👁️ Multimodal: Image attached (${activeImages.length}) → ${defaultVisionModel}`,
      };
    }

    // If user provided a prompt and multiple vision routes/models exist:
    // Evaluate the query against visionRoutes using keyword matching & lexical scoring
    const queryLower = query.toLowerCase();
    let bestMatch = null;
    let maxScore = 0;

    for (const route of visionRoutes) {
      if (!route.keywords || route.keywords.length === 0) continue;
      let score = 0;
      for (const kw of route.keywords) {
        const kwLower = kw.toLowerCase();
        if (queryLower.includes(kwLower)) {
          score += kw.length > 4 ? 3 : 2;
        }
      }
      if (score > maxScore) {
        maxScore = score;
        bestMatch = route;
      }
    }

    if (bestMatch && maxScore > 0) {
      let targetModel = bestMatch.model;
      if (!targetModel || !visionModels.some(vm => vm.name === targetModel)) {
        targetModel = defaultVisionModel;
      }
      return {
        model: targetModel,
        category: bestMatch.category,
        color: bestMatch.color || '#06b6d4',
        confidence: Math.min(99, 75 + maxScore * 5),
        engine: 'vision',
        explanation: `👁️ Multimodal Decision: Matched rule "${bestMatch.category}" → ${targetModel}`,
      };
    }

    return {
      model: defaultVisionModel,
      category: primaryRoute?.category || 'vision',
      color: primaryRoute?.color || '#06b6d4',
      confidence: 100,
      engine: 'vision',
      explanation: `👁️ Multimodal: Image attached (${activeImages.length}) → ${defaultVisionModel}`,
    };
  }

  /**
   * Fast synchronous lexical route matching.
   * Used for instant input-typing preview and as a fallback.
   * 
   * @param {string} query
   * @returns {{ model: string, category: string|null, color: string|null, confidence: number, engine: string }}
   */
  quickRoute(query) {
    const activeImages = store.state.activeImages || [];
    if (activeImages.length > 0) {
      return this.routeMultimodal(query);
    }
    return this.routeByKeywords(query);
  }

  /**
   * Main routing function.
   * Evaluates query using Guardrails, Vector, System 1, or Keywords based on active mode.
   * 
   * @param {string} query
   * @returns {Promise<{
   *   model: string,
   *   category: string|null,
   *   color: string|null,
   *   confidence: number,
   *   engine: 'vector'|'systemone'|'keywords'|'guardrail'|'vision'|'fallback',
   *   latencyMs?: number,
   *   probabilities?: Record<string, number>,
   *   similarityScore?: number,
   *   guardrail?: object,
   *   explanation: string
   * }>}
   */
  async route(query) {
    const mode = store.state.routingMode || 'vector';
    const routerModel = store.state.routerModel || '';
    const embeddingModel = store.state.embeddingModel || 'embeddinggemma-2:latest';

    // 0. Check for attached images (Multimodal / Vision Task)
    const activeImages = store.state.activeImages || [];
    if (activeImages.length > 0) {
      const decision = this.routeMultimodal(query);
      return {
        ...decision,
        latencyMs: 1,
      };
    }

    // 1. Check Semantic Guardrails first (if enabled)
    if (store.state.guardrailsEnabled && query && query.trim().length > 3) {
      try {
        const guardMatch = await this.checkGuardrails(query, embeddingModel);
        if (guardMatch && guardMatch.action === 'block') {
          return {
            model: '',
            category: 'Safety Intercept',
            color: '#ef4444',
            confidence: guardMatch.score,
            engine: 'guardrail',
            latencyMs: guardMatch.latencyMs,
            guardrail: guardMatch.guardrail,
            explanation: `🛡️ Guardrail Intercept: "${guardMatch.guardrail.name}" (${guardMatch.score}% similarity) blocked prompt`,
          };
        }
      } catch (err) {
        console.warn('Semantic guardrails check failed:', err);
      }
    }

    // 2. Vector Semantic Mode
    if (mode === 'vector') {
      try {
        const vectorDecision = await this.routeByVector(query, embeddingModel);
        if (vectorDecision) return vectorDecision;
      } catch (err) {
        console.warn('Vector semantic routing failed, falling back to keywords:', err);
      }
      return this.routeByKeywords(query);
    }

    // 3. System 1 Decision Mode
    if (mode === 'systemone' || mode === 'laya') {
      try {
        const sys1Decision = await this.routeBySystemOne(query, routerModel);
        if (sys1Decision) return sys1Decision;
      } catch (err) {
        console.warn('System 1 routing failed, falling back to keywords:', err);
      }
      return this.routeByKeywords(query);
    }

    // 4. Hybrid Mode (Vector -> System 1 -> Keywords)
    if (mode === 'hybrid') {
      // Try Vector first
      try {
        const vectorDecision = await this.routeByVector(query, embeddingModel);
        if (vectorDecision && vectorDecision.confidence >= 40) {
          return vectorDecision;
        }
      } catch {
        // Continue
      }

      // Try System 1 second if configured
      if (routerModel) {
        try {
          const sys1Decision = await this.routeBySystemOne(query, routerModel);
          if (sys1Decision && sys1Decision.confidence >= 50) {
            return sys1Decision;
          }
        } catch {
          // Continue to keywords
        }
      }

      // Fallback to keywords
      return this.routeByKeywords(query);
    }

    // 5. Explicit Keywords Mode
    return this.routeByKeywords(query);
  }

  /**
   * Route user query using Vector Cosine Similarity via embedding model (e.g. embeddinggemma-2).
   * 
   * @param {string} query 
   * @param {string} embeddingModel 
   * @returns {Promise<object|null>}
   */
  async routeByVector(query, embeddingModel) {
    const routes = store.state.routes.filter(r => r.category);
    if (routes.length === 0) return null;

    const fallbackChatModel = this.getFallbackChatModel();
    const chatModels = this.getChatModels();
    const startTime = performance.now();

    // 1. Get or generate query embedding
    let queryEmbedding = embeddingCache.get(embeddingModel, query);
    if (!queryEmbedding) {
      queryEmbedding = await ollama.embed(embeddingModel, query);
      if (Array.isArray(queryEmbedding)) {
        embeddingCache.set(embeddingModel, query, queryEmbedding);
      }
    }
    if (!queryEmbedding || !Array.isArray(queryEmbedding)) return null;

    // 2. Get embeddings for each route description
    const routeScores = [];
    for (const r of routes) {
      const routeText = r.description || (r.keywords || []).slice(0, 10).join(', ');
      if (!routeText) continue;

      let rEmbedding = embeddingCache.get(embeddingModel, routeText);
      if (!rEmbedding) {
        try {
          rEmbedding = await ollama.embed(embeddingModel, routeText);
          if (Array.isArray(rEmbedding)) {
            embeddingCache.set(embeddingModel, routeText, rEmbedding);
          }
        } catch {
          continue;
        }
      }

      if (rEmbedding && Array.isArray(rEmbedding)) {
        const sim = cosineSimilarity(queryEmbedding, rEmbedding);
        routeScores.push({
          route: r,
          score: sim,
        });
      }
    }

    if (routeScores.length === 0) return null;

    // Sort descending by similarity
    routeScores.sort((a, b) => b.score - a.score);
    const top = routeScores[0];
    const elapsed = Math.round(performance.now() - startTime);

    // If best similarity is negative or negligible (< 0.20), let it fallback
    if (top.score < 0.20) return null;

    let targetModel = top.route.model;
    if (!targetModel || (chatModels.length > 0 && !chatModels.some(m => m.name === targetModel))) {
      targetModel = fallbackChatModel;
    }

    const confidencePercent = Math.min(Math.round(top.score * 100), 100);

    return {
      model: targetModel,
      category: top.route.category,
      color: top.route.color || '#6366f1',
      confidence: confidencePercent,
      engine: 'vector',
      latencyMs: elapsed,
      similarityScore: top.score,
      explanation: `🧬 Vector: "${top.route.category}" (${confidencePercent}% similarity · ${elapsed}ms) → ${targetModel}`,
    };
  }

  /**
   * Classify user prompt using Ollama System 1 decision model.
   * 
   * @param {string} query
   * @param {string} routerModel
   * @returns {Promise<object|null>}
   */
  async routeBySystemOne(query, routerModel) {
    if (!routerModel) return null;
    const routes = store.state.routes.filter(r => r.category);
    if (routes.length === 0) return null;

    const fallbackChatModel = this.getFallbackChatModel();

    // Prepare criteria mapping from active routes
    const criteria = {};
    for (const r of routes) {
      criteria[r.category] = r.description || r.keywords.slice(0, 10).join(', ');
    }

    const startTime = performance.now();

    const response = await ollama.systemOne(routerModel, query, {
      route: {
        type: 'choice',
        instructions: 'Which category does this user prompt or request best belong to?',
        criteria,
      },
    });

    const elapsed = Math.round(performance.now() - startTime);
    const ans = response.answers?.route;
    if (!ans || !ans.choice) return null;

    const chosenCategory = ans.choice;
    const matchingRoute = routes.find(r => r.category === chosenCategory);
    const chatModels = this.getChatModels();

    // Ensure target model is a valid chat model
    let targetModel = matchingRoute?.model;
    if (!targetModel || (chatModels.length > 0 && !chatModels.some(m => m.name === targetModel))) {
      targetModel = fallbackChatModel;
    }

    const probabilities = ans.probabilities || {};
    const prob = probabilities[chosenCategory] ?? ans.confidence ?? 0.85;
    const confidencePercent = Math.min(Math.round(prob * 100), 100);

    return {
      model: targetModel,
      category: matchingRoute?.category || chosenCategory,
      color: matchingRoute?.color || '#6366f1',
      confidence: confidencePercent,
      engine: 'systemone',
      latencyMs: elapsed,
      probabilities,
      systemOneConfidence: ans.confidence,
      explanation: `🧠 System 1: "${chosenCategory}" (${confidencePercent}% prob · ${elapsed}ms) → ${targetModel}`,
    };
  }

  // Alias for backward compatibility
  async routeByLaya(query, routerModel) {
    return this.routeBySystemOne(query, routerModel);
  }

  /**
   * Keyword-based matching route engine.
   * 
   * @param {string} query
   * @returns {object}
   */
  routeByKeywords(query) {
    const routes = store.state.routes;
    const fallbackModel = this.getFallbackChatModel();
    const chatModels = this.getChatModels();
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).map(w => w.replace(/[^a-z0-9+#]/g, ''));

    let bestMatch = null;
    let bestScore = 0;

    for (const route of routes) {
      let score = 0;
      let matchedKeywords = 0;

      for (const keyword of route.keywords || []) {
        const kw = keyword.toLowerCase().trim();
        if (!kw) continue;

        if (queryWords.includes(kw)) {
          score += 3;
          matchedKeywords++;
          continue;
        }

        if (queryLower.includes(kw)) {
          score += 1;
          matchedKeywords++;
        }
      }

      const confidence = (route.keywords && route.keywords.length > 0)
        ? (matchedKeywords / route.keywords.length) * 100
        : 0;

      if (score > bestScore) {
        bestScore = score;

        let targetModel = route.model;
        if (!targetModel || (chatModels.length > 0 && !chatModels.some(m => m.name === targetModel))) {
          targetModel = fallbackModel;
        }

        bestMatch = {
          model: targetModel,
          category: route.category,
          color: route.color,
          confidence: Math.min(Math.round(confidence * 1.5) + 30, 95),
          engine: 'keywords',
          score,
          explanation: `🏷️ Keywords: "${route.category}" (${Math.min(Math.round(confidence * 1.5) + 30, 95)}%) → ${targetModel}`,
        };
      }
    }

    if (!bestMatch || bestScore === 0) {
      return {
        model: fallbackModel,
        category: 'fallback',
        color: '#64748b',
        confidence: 0,
        engine: 'fallback',
        explanation: `Fallback → ${fallbackModel}`,
      };
    }

    return bestMatch;
  }

  /**
   * Check query against semantic guardrails using dense embeddings.
   * 
   * @param {string} query 
   * @param {string} embeddingModel 
   * @returns {Promise<{ triggered: boolean, guardrail: object, score: number, action: string, latencyMs: number }|null>}
   */
  async checkGuardrails(query, embeddingModel) {
    const guardrails = store.state.guardrails || [];
    if (guardrails.length === 0) return null;

    const startTime = performance.now();
    let queryEmbedding = embeddingCache.get(embeddingModel, query);
    if (!queryEmbedding) {
      queryEmbedding = await ollama.embed(embeddingModel, query);
      if (Array.isArray(queryEmbedding)) {
        embeddingCache.set(embeddingModel, query, queryEmbedding);
      }
    }
    if (!queryEmbedding || !Array.isArray(queryEmbedding)) return null;

    for (const guard of guardrails) {
      if (!guard.description) continue;
      let guardEmbedding = embeddingCache.get(embeddingModel, guard.description);
      if (!guardEmbedding) {
        guardEmbedding = await ollama.embed(embeddingModel, guard.description);
        if (Array.isArray(guardEmbedding)) {
          embeddingCache.set(embeddingModel, guard.description, guardEmbedding);
        }
      }

      if (guardEmbedding && Array.isArray(guardEmbedding)) {
        const sim = cosineSimilarity(queryEmbedding, guardEmbedding);
        const threshold = guard.threshold ?? 0.78;
        if (sim >= threshold) {
          const elapsed = Math.round(performance.now() - startTime);
          return {
            triggered: true,
            guardrail: guard,
            score: Math.round(sim * 100),
            action: guard.action || 'block',
            latencyMs: elapsed,
          };
        }
      }
    }

    return null;
  }

  /**
   * Check semantic similarity between a candidate description and existing routes
   * to detect route conflicts or overlaps.
   * 
   * @param {string} candidateDesc 
   * @param {Array} existingRoutes 
   * @param {string} currentRouteId 
   * @param {string} embeddingModel 
   * @returns {Promise<Array<{ category: string, color: string, similarity: number }>>}
   */
  async checkRouteOverlap(candidateDesc, existingRoutes, currentRouteId, embeddingModel) {
    if (!candidateDesc || candidateDesc.trim().length < 5) return [];

    let candEmbedding = embeddingCache.get(embeddingModel, candidateDesc);
    if (!candEmbedding) {
      try {
        candEmbedding = await ollama.embed(embeddingModel, candidateDesc);
        if (Array.isArray(candEmbedding)) {
          embeddingCache.set(embeddingModel, candidateDesc, candEmbedding);
        }
      } catch {
        return [];
      }
    }
    if (!candEmbedding || !Array.isArray(candEmbedding)) return [];

    const overlaps = [];
    for (const r of existingRoutes) {
      if (r.id === currentRouteId) continue;
      const otherText = r.description || (r.keywords || []).slice(0, 10).join(', ');
      if (!otherText) continue;

      let otherEmbedding = embeddingCache.get(embeddingModel, otherText);
      if (!otherEmbedding) {
        try {
          otherEmbedding = await ollama.embed(embeddingModel, otherText);
          if (Array.isArray(otherEmbedding)) {
            embeddingCache.set(embeddingModel, otherText, otherEmbedding);
          }
        } catch {
          continue;
        }
      }

      if (otherEmbedding && Array.isArray(otherEmbedding)) {
        const sim = cosineSimilarity(candEmbedding, otherEmbedding);
        overlaps.push({
          category: r.category,
          color: r.color,
          similarity: Math.round(sim * 100),
        });
      }
    }

    return overlaps.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Get a human-readable explanation of the routing decision.
   * @param {object} decision
   * @returns {string}
   */
  explain(decision) {
    return decision.explanation || (decision.category
      ? `${decision.category} → ${decision.model}`
      : `Fallback → ${decision.model}`);
  }
}

export const router = new Router();
