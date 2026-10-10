# Source Module — Agent Guidelines (`src/`)

## Purpose
The `src/` directory contains all client-side application logic, multi-engine routing implementations, state management, Mini-RAG document pipelines, Ollama API communications, and retro-terminal UI views.

## Key Files
| File | Role |
|---|---|
| `main.js` | UI controller & orchestrator; handles DOM event delegation, drag-drop/paste file ingestion, message streaming, and route preview. |
| `router.js` | Multi-engine router; implements `quickRoute`, `route`, `routeMultimodal`, `checkGuardrails`, `routeBySystemOne`, `routeByVector`, `routeByKeywords`. |
| `store.js` | Centralized state store (`Store`); manages pub/sub events (`on`, `emit`) and syncs state with `localStorage`. |
| `ollama.js` | API client (`OllamaClient`); handles `/api/tags`, `/api/chat` (streaming/sync), `/api/embed`, `/v1/systemone`, and message sanitization. |
| `rag.js` | Document processing & Mini-RAG; handles PDF.js extraction, JSON formatting, chunk batching, and semantic cosine similarity retrieval. |
| `vector.js` | Vector utilities; cosine similarity computation, text chunking with overlap, and LRU in-memory embedding cache (`embeddingCache`). |
| `utils.js` | Shared formatting helpers; Markdown parser, debouncing, duration formatting, and HTML escaping. |
| `style.css` | Complete retro-cockpit styling system (`#050505` background, `#0a0a0a` panels, `#333` borders, monospace typography). |

## Core Architectural Conventions

### 1. Multimodal & Vision Rules
- When images are attached, `router.routeMultimodal(query)` filters candidates strictly to vision models (`isVisionModel`).
- If multiple vision routes or models exist, it scores `query` text against vision rules (e.g., `vision-ocr` vs. `vision-art`) instead of hardcoding a single model.
- **Critical Invariant**: Never send `{ images: [...] }` to text/code models. In `ollama.js` and `main.js`, `sanitizeMessages(model, messages)` strips image binaries from conversation history when targeting non-vision models to prevent Ollama `400 invalid_request_error`.

### 2. Decision Routing Cascades
- **Guardrails First**: Check semantic prompt injection/jailbreak guardrails before dispatching.
- **Fast Preview**: `router.quickRoute(text)` must execute synchronously for instant keystroke feedback.
- **Deep Routing**: `router.route(text)` runs asynchronously using System 1 fast decisioning (`/v1/systemone`) or Dense Vector embeddings (`/api/embed`).
- **Safe Fallback**: Always verify candidate models with `m.isChatModel`. Never allow decision encoders or embedding generators as completion targets.

### 3. Mini-RAG & Embedding Guardrails
- **Chunk Batching**: Always batch document embedding requests in groups of 10 chunks (`BATCH_SIZE = 10`) in `rag.js` to avoid payload exhaustion and server timeouts.
- **Extended Timeout**: Keep `AbortSignal.timeout(60000)` on `/api/embed` requests.
- **PDF Extraction**: Parse PDFs using PDF.js text layer; never attempt raw UTF-8 `FileReader.readAsText()` on binary PDFs.
- **JSON Formatting**: Pretty-print JSON files (`null, 2`) prior to chunking so chunks split on meaningful keys.

### 4. UI & Terminal Aesthetic
- **No Floating Avatar Boxes**: Do not reintroduce `U` or `✦` avatar boxes. Terminal headers (`admin@ollama-router:~$ ` and `> ollama-router: `) identify message roles.
- **Indicator Lifecycle**: When conversations are deleted, switched, or input is cleared, always invoke `resetRoutingIndicator()` to return the indicator to `• Route: auto`.
- **Streaming Safety**: In streaming callbacks (`onToken`, `onDone`, `catch`), always check `if (store.getActiveConversation()?.id !== convId)` to prevent orphaned updates if the user switched or deleted the chat.

## Common Code Patterns

### Reactive State Subscription
```javascript
import { store } from './store.js';

// Subscribe to state events
store.on('stateChange', (state) => {
  renderUI(state);
});

// Update state
store.update({ routingMode: 'vector' });
```

### Document Vector Retrieval
```javascript
import { retrieveRelevantChunks, formatRAGContext } from './rag.js';

const relevantChunks = await retrieveRelevantChunks(
  content,
  store.state.activeDocuments,
  store.state.embeddingModel || 'embeddinggemma-2:latest',
  3,
  0.32
);
const ragSystemPrompt = formatRAGContext(relevantChunks);
```
