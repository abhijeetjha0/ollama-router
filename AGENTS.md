# Project Agent Guidelines — Ollama Router

## Project Overview
**Ollama Router** is an intelligent, zero-backend model routing cockpit for local LLMs powered by Ollama. It dynamically routes user prompts to specialized local models (`qwen2.5-coder:3b`, `qwen3-vl:2b`, etc.) using multi-engine decision routing (dense vector semantic embeddings via `embeddinggemma-2:latest`, optional fast decision encoders via `/v1/systemone`, keyword heuristics, prompt-aware multimodal vision detection, and semantic guardrails). It also features client-side Mini-RAG for grounded context retrieval from uploaded PDFs, JSON, and code files.

## Tech Stack
- **Runtime & Language**: Pure modern JavaScript (ES Modules, standard DOM APIs).
- **Tooling & Bundler**: Vite 8 (`npm run dev`, `npm run build`).
- **Styling**: Vanilla CSS adhering to a retro-terminal cockpit aesthetic (`#050505` background, `#0a0a0a` panels, sharp `#333` borders, monospace typography, Google Material Symbols).
- **External Integration**: Local Ollama server (`http://localhost:11434`) proxied via Vite.
- **Client Libraries**: In-memory PDF parsing via CDN-backed PDF.js (`pdfjs-dist`).

## Global Conventions
- **CORS Handling**: In development and local execution, always use relative URLs (`/api/...`, `/v1/...`) so Vite reverse-proxies requests to Ollama (`http://localhost:11434`), completely eliminating CORS preflight issues.
- **Model Role Separation**:
  - **Chat Models**: Completion/chat targets (e.g., `qwen2.5-coder:3b`, `llama3`).
  - **Decision Models**: Rapid encoder classification models (via `/v1/systemone`). Never target decision models for chat completions.
  - **Embedding Models**: Vector generation models (e.g., `embeddinggemma-2:latest`). Never target embedding models for chat completions.
  - **Vision Models**: Multimodal models with CLIP projectors (e.g., `qwen3-vl:2b`, `llava`).
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
