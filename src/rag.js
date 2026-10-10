/**
 * Ollama Router — Mini-RAG (Document Processing & Retrieval)
 * 
 * Provides client-side document chunking, embedding generation,
 * and top-k semantic retrieval for grounded prompt generation.
 */

import { ollama } from './ollama.js';
import { chunkText, cosineSimilarity, embeddingCache } from './vector.js';

/**
 * Process an uploaded text or code file into vector-embedded chunks.
 * 
 * @param {File} file 
 * @param {string} embeddingModel 
 * @returns {Promise<{
 *   id: string,
 *   name: string,
 *   size: number,
 *   type: string,
 *   chunksCount: number,
 *   chunks: Array<{ text: string, index: number, embedding: number[] }>,
 *   createdAt: number
 * }>}
 */
export async function processDocumentFile(file, embeddingModel, onProgress) {
  const text = await readFileAsText(file);
  if (!text || text.trim().length === 0) {
    throw new Error(`File "${file.name}" is empty`);
  }

  // 1. Chunk document
  const rawChunks = chunkText(text, 500, 100);
  if (rawChunks.length === 0) {
    throw new Error(`Could not generate chunks for "${file.name}"`);
  }

  // 2. Generate embeddings for chunks
  const chunkTexts = rawChunks.map(c => c.text);
  let embeddings = [];

  try {
    // Check cache first for all chunks
    const missingIndices = [];
    const missingTexts = [];
    embeddings = new Array(rawChunks.length);

    for (let i = 0; i < rawChunks.length; i++) {
      const cached = embeddingCache.get(embeddingModel, rawChunks[i].text);
      if (cached) {
        embeddings[i] = cached;
      } else {
        missingIndices.push(i);
        missingTexts.push(rawChunks[i].text);
      }
    }

    if (missingTexts.length > 0) {
      // Batch embed in groups of 10 chunks to prevent timeouts on larger files
      const BATCH_SIZE = 10;
      for (let b = 0; b < missingTexts.length; b += BATCH_SIZE) {
        const batchTexts = missingTexts.slice(b, b + BATCH_SIZE);
        const batchIndices = missingIndices.slice(b, b + BATCH_SIZE);

        if (typeof onProgress === 'function') {
          onProgress({
            current: Math.min(b + BATCH_SIZE, missingTexts.length),
            total: missingTexts.length,
            percent: Math.round(((b + BATCH_SIZE) / missingTexts.length) * 100),
          });
        }

        const newEmbeddings = await ollama.embed(embeddingModel, batchTexts);
        const embeddingList = Array.isArray(newEmbeddings[0]) ? newEmbeddings : [newEmbeddings];

        for (let j = 0; j < batchIndices.length; j++) {
          const origIdx = batchIndices[j];
          const emb = embeddingList[j];
          embeddings[origIdx] = emb;
          embeddingCache.set(embeddingModel, rawChunks[origIdx].text, emb);
        }
      }
    }
  } catch (err) {
    throw new Error(`Failed to generate embeddings for "${file.name}": ${err.message}`);
  }

  // Combine chunks with their embeddings
  const chunks = rawChunks.map((c, i) => ({
    text: c.text,
    index: c.index,
    embedding: embeddings[i] || [],
  }));

  return {
    id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: file.name,
    size: file.size,
    type: file.type || 'text/plain',
    chunksCount: chunks.length,
    chunks,
    createdAt: Date.now(),
  };
}

/**
 * Retrieve top-k relevant document chunks for a query using cosine similarity.
 * 
 * @param {string} query 
 * @param {Array} documents List of active processed documents
 * @param {string} embeddingModel 
 * @param {number} topK Maximum chunks to retrieve (default 3)
 * @param {number} minSimilarity Minimum similarity score threshold (default 0.35)
 * @returns {Promise<Array<{ text: string, docName: string, score: number, index: number }>>}
 */
export async function retrieveRelevantChunks(query, documents, embeddingModel, topK = 3, minSimilarity = 0.35) {
  if (!query || !documents || documents.length === 0) return [];

  // Flatten all chunks across documents
  const allChunks = [];
  for (const doc of documents) {
    for (const chunk of doc.chunks || []) {
      if (chunk.embedding && chunk.embedding.length > 0) {
        allChunks.push({
          docName: doc.name,
          text: chunk.text,
          index: chunk.index,
          embedding: chunk.embedding,
        });
      }
    }
  }

  if (allChunks.length === 0) return [];

  // Embed query
  let queryEmbedding = embeddingCache.get(embeddingModel, query);
  if (!queryEmbedding) {
    try {
      queryEmbedding = await ollama.embed(embeddingModel, query);
      if (queryEmbedding && Array.isArray(queryEmbedding)) {
        embeddingCache.set(embeddingModel, query, queryEmbedding);
      }
    } catch (e) {
      console.warn('Failed to embed RAG query:', e);
      return [];
    }
  }

  if (!queryEmbedding) return [];

  // Score chunks
  const scored = allChunks.map(chunk => {
    const score = cosineSimilarity(queryEmbedding, chunk.embedding);
    return {
      docName: chunk.docName,
      text: chunk.text,
      index: chunk.index,
      score,
    };
  });

  // Filter and sort descending
  return scored
    .filter(item => item.score >= minSimilarity)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Format retrieved chunks into context text to inject into the system prompt or user query.
 * 
 * @param {Array<{ text: string, docName: string, score: number }>} chunks 
 * @returns {string}
 */
export function formatRAGContext(chunks) {
  if (!chunks || chunks.length === 0) return '';

  const parts = chunks.map((c, i) => {
    return `[Context ${i + 1} from "${c.docName}" (relevance: ${Math.round(c.score * 100)}%)]:\n${c.text}`;
  });

  return `\n\n--- RELEVANT DOCUMENT CONTEXT ---\nUse the following reference information from attached files when relevant:\n${parts.join('\n\n')}\n-----------------------------------\n`;
}

/**
 * Extract clean text content from a PDF file using PDF.js.
 * @param {File} file 
 * @returns {Promise<string>}
 */
async function extractPdfText(file) {
  if (typeof window === 'undefined') {
    throw new Error('PDF extraction is only available in browser');
  }

  // Dynamically load PDF.js if not already present
  if (!window.pdfjsLib) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          resolve();
        } else {
          reject(new Error('PDF.js failed to initialize'));
        }
      };
      script.onerror = () => reject(new Error('Failed to load PDF library from CDN'));
      document.head.appendChild(script);
    });
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map(item => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (pageText) {
      fullText += (fullText ? '\n\n' : '') + `[Page ${i}]\n${pageText}`;
    }
  }

  if (!fullText.trim()) {
    throw new Error(`PDF "${file.name}" contains no selectable text (it may be a scanned or image-only document).`);
  }

  return fullText;
}

/**
 * Helper to read a browser File as clean text (supports PDF, JSON, and text/code files).
 * @param {File} file 
 * @returns {Promise<string>}
 */
async function readFileAsText(file) {
  const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
  if (isPdf) {
    return await extractPdfText(file);
  }

  const rawText = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });

  const isJson = file.name.toLowerCase().endsWith('.json') || file.type === 'application/json';
  if (isJson) {
    try {
      const parsed = JSON.parse(rawText);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return rawText;
    }
  }

  return rawText;
}
