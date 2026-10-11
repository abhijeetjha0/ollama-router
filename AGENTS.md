# Project Agent Guidelines — Ollama Router

## Project Overview
**Ollama Router** is an intelligent, zero-backend model routing cockpit for local LLMs powered by Ollama. It dynamically routes user prompts to specialized local models using multi-engine decision routing (dense vector semantic embeddings via any Ollama-compatible embedding model, optional fast decision encoders via `/v1/systemone`, keyword heuristics, prompt-aware multimodal vision detection, and semantic guardrails). It also features client-side Mini-RAG for grounded context retrieval from uploaded PDFs, JSON, and code files.

## Tech Stack
- **Runtime & Framework**: React 19 with JSX, Modern JavaScript (ES Modules).
- **Tooling & Bundler**: Vite 8 (`npm run dev`, `npm run build`, `@vitejs/plugin-react`).
- **Styling**: Vanilla CSS adhering to a retro-terminal cockpit aesthetic (`#050505` background, `#0a0a0a` panels, sharp `#333` borders, monospace typography, Google Material Symbols).
- **External Integration**: Local Ollama server (`http://localhost:11434`) proxied via Vite.
- **Client Libraries**: In-memory PDF parsing via CDN-backed PDF.js (`pdfjs-dist`).

## Global Conventions
- **CORS Handling**: In development and local execution, always use relative URLs (`/api/...`, `/v1/...`) so Vite reverse-proxies requests to Ollama (`http://localhost:11434`), completely eliminating CORS preflight issues.
- **Model Role Separation**:
  - **Chat Models**: Completion/chat targets. User selects from discovered Ollama models.
  - **Function / Tool Models**: Models fine-tuned for tool use and function calling (e.g. `functiongemma`). Listed in the Models tab with `Function / Tools` badge and selectable in routing dropdowns with `(Tools)`.
  - **Decision Models**: Rapid encoder classification models (via `/v1/systemone`). User-selected; never target decision models for chat completions.
  - **Embedding Models**: Vector generation models (e.g., `nomic-embed-text`, `mxbai-embed-large`). User-selected from discovered models; never target embedding models for chat completions.
  - **Vision Models**: Multimodal models with CLIP projectors (e.g., `llava`, `moondream`). Auto-detected by capability.
- **No Hardcoded Models**: Never hardcode specific model names (e.g., `embeddinggemma-2:latest`) as defaults or fallbacks in code. Models are auto-discovered from Ollama at runtime and the user selects their preferred embedding/decision/chat models. When a required model type (embedding, decision) is not configured or not available, features that depend on it must gracefully degrade to the next best engine (e.g., vector routing → keyword routing) or show a clear user-facing message.
- **Multimodal Payload Sanitization**: Ollama throws a `400 invalid_request_error` if an `images` property is passed to a non-multimodal model. Non-vision model payloads must always have image binary arrays stripped from chat history.
- **State Persistence**: User preferences, custom routes, conversations, and active document chunk indices are synchronized in `localStorage` under key `ollama-router`.

## Modular Guidelines
This repository uses modular, folder-scoped agent guidelines. Refer to the directory-specific guidelines below when working in submodules:

## Directory Guide
| Directory | Purpose | Detailed Guidelines |
|---|---|---|
| `src/` | Core application logic, routing engines, state, RAG, Ollama client, and UI controllers | [src/AGENTS.md](file:///Users/abhijit/Documents/Projects/Learning/AI/ollama-router/src/AGENTS.md) |
| `public/` | Static web assets and icons | Use root guidelines |
| `.agents/` | Local agent skills and developer tooling | Managed by agent skill scanner |
