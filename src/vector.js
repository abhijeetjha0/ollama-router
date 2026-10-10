/**
 * Ollama Router — Vector Math, Chunking & Cache Utilities
 * 
 * Provides dense vector operations, sliding-window chunking, 
 * and an embedding cache for fast on-device semantic operations.
 */

/**
 * Compute the dot product of two vectors.
 * @param {number[]} a 
 * @param {number[]} b 
 * @returns {number}
 */
export function dotProduct(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * Compute the Euclidean magnitude (L2 norm) of a vector.
 * @param {number[]} a 
 * @returns {number}
 */
export function magnitude(a) {
  if (!a || a.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * a[i];
  }
  return Math.sqrt(sum);
}

/**
 * Compute cosine similarity between two vectors.
 * Returns a value between -1.0 and 1.0 (typically 0.0 to 1.0 for normalized text embeddings).
 * @param {number[]} a 
 * @param {number[]} b 
 * @returns {number}
 */
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  const magA = magnitude(a);
  const magB = magnitude(b);
  if (magA === 0 || magB === 0) return 0;
  const sim = dotProduct(a, b) / (magA * magB);
  // Clamp floating point inaccuracies
  return Math.max(-1, Math.min(1, sim));
}

/**
 * Split text into overlapping chunks for RAG.
 * Respects paragraph and sentence boundaries where possible.
 * 
 * @param {string} text 
 * @param {number} chunkSize Maximum characters per chunk (default ~600)
 * @param {number} overlap Overlapping characters (default ~100)
 * @returns {Array<{ text: string, index: number }>}
 */
export function chunkText(text, chunkSize = 600, overlap = 100) {
  if (!text || typeof text !== 'string') return [];
  const clean = text.trim();
  if (clean.length <= chunkSize) {
    return [{ text: clean, index: 0 }];
  }

  const chunks = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < clean.length) {
    let end = start + chunkSize;

    if (end < clean.length) {
      // Try to break at a paragraph or newline
      const lastParagraph = clean.lastIndexOf('\n\n', end);
      if (lastParagraph > start + overlap) {
        end = lastParagraph;
      } else {
        // Try breaking at a sentence end (. or ? or !)
        const lastSentence = clean.slice(start, end).search(/[.!?]\s+(?=[A-Z0-9])/);
        if (lastSentence !== -1 && lastSentence > overlap) {
          end = start + lastSentence + 1;
        } else {
          // Break at a whitespace
          const lastSpace = clean.lastIndexOf(' ', end);
          if (lastSpace > start + overlap) {
            end = lastSpace;
          }
        }
      }
    } else {
      end = clean.length;
    }

    const chunkContent = clean.slice(start, end).trim();
    if (chunkContent.length > 0) {
      chunks.push({
        text: chunkContent,
        index: chunkIndex++,
      });
    }

    // Advance window with overlap
    start = Math.max(start + 1, end - overlap);
  }

  return chunks;
}

/**
 * Simple fast hash function for cache keys.
 * @param {string} str 
 * @returns {string}
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * In-memory + optional localStorage cache for text embeddings.
 */
class EmbeddingCache {
  constructor() {
    this._memory = new Map();
    this._storageKey = 'ollama-router-embeddings-cache';
    this._load();
  }

  _load() {
    try {
      const data = localStorage.getItem(this._storageKey);
      if (data) {
        const parsed = JSON.parse(data);
        for (const [k, v] of Object.entries(parsed)) {
          this._memory.set(k, v);
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  _persist() {
    try {
      // Keep only up to 300 entries in localStorage
      const entries = Array.from(this._memory.entries()).slice(-300);
      const obj = Object.fromEntries(entries);
      localStorage.setItem(this._storageKey, JSON.stringify(obj));
    } catch {
      // Storage full or quota exceeded
    }
  }

  getKey(model, text) {
    return `${model}:${hashString(text)}:${text.length}`;
  }

  get(model, text) {
    const key = this.getKey(model, text);
    return this._memory.get(key) || null;
  }

  set(model, text, embedding) {
    const key = this.getKey(model, text);
    this._memory.set(key, embedding);
    this._persist();
  }

  clear() {
    this._memory.clear();
    try {
      localStorage.removeItem(this._storageKey);
    } catch {}
  }
}

export const embeddingCache = new EmbeddingCache();
