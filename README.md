# ⚡ Ollama Router

> **Intelligent, zero-backend model routing cockpit for local LLMs powered by Ollama.**

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Runtime: Vanilla JS](https://img.shields.io/badge/Runtime-Vanilla%20JS%20(ES%20Modules)-yellow.svg)
![Bundler: Vite 8](https://img.shields.io/badge/Bundler-Vite%208-purple.svg)
![Backend: Zero Backend](https://img.shields.io/badge/Architecture-Zero--Backend%20Client-green.svg)
![Ollama](https://img.shields.io/badge/Engine-Ollama%20Local-black.svg)

**Ollama Router** dynamically evaluates user prompts and multimodal inputs to route queries to specialized local models (`qwen2.5-coder:3b`, `qwen3-vl:2b`, `llama3`, etc.) using a multi-engine decision pipeline (dense vector semantic embeddings, fast decision encoders, keyword heuristics, multimodal vision detectors, and semantic guardrails). It also features client-side Mini-RAG for grounded context retrieval from uploaded PDFs, JSON, and code files.

---

## 🌟 Key Features

### 🧠 Multi-Engine Decision Routing
* **Vector Semantic Routing**: High-accuracy cosine similarity matching against route descriptions using `embeddinggemma-2:latest` dense embeddings.
* **System 1 Decision Models**: Fast encoder classification via `/v1/systemone` to categorize query intent with confidence scores.
* **Lexical Heuristics**: Instant keystroke preview as you type using keyword matching.
* **Hybrid Cascade**: Combines Guardrails $\rightarrow$ Vector Embeddings / Decision Encoders $\rightarrow$ Lexical Keywords $\rightarrow$ Safe Fallback.

### 👁️ Prompt-Aware Multimodal Vision Routing
* **Drag-and-Drop & Clipboard Paste (`Cmd+V`)**: Upload images directly into the chat cockpit.
* **Vision Model Isolation**: Automatically detects attached images and restricts candidates to multimodal vision models (`qwen3-vl:2b`, `llava`, `minicpm-v`).
* **Multi-Vision Decisioning**: If multiple vision models or sub-rules exist (e.g., `vision-ocr` vs. `vision-art`), the router evaluates prompt text to select the best vision specialist.
* **Payload Sanitization**: In multi-turn chats, raw image binaries from earlier vision turns are automatically stripped when subsequent prompts switch to text/code models, eliminating Ollama `400 invalid_request_error` crashes.

### 🛡️ Semantic Security Guardrails
* Vector similarity scanning against prompt injection, jailbreaks (e.g., DAN mode), and system prompt leak attempts before dispatching to LLMs.
* Configurable threshold scoring and immediate blocking or warning intercepts.

### 📚 Client-Side Mini-RAG (Document Grounding)
* **All File Types Supported**: Attach `.pdf`, `.json`, `.csv`, `.md`, `.txt`, `.py`, `.js`, and more.
* **Native PDF.js Parsing**: In-memory PDF page-by-page text extraction without backend servers.
* **Chunk Batching & Timeout Resilience**: Chunks are processed in batches of 10 with extended 60-second timeouts to prevent server timeouts on large documents.
* **Top-K Retrieval**: Embeds queries once and uses cosine similarity to inject only the most relevant paragraphs into the prompt, preventing LLM context window bloat.

### 🖥️ Retro-Terminal Cockpit Aesthetic
* Sleek dark mode styling (`#050505` background, `#0a0a0a` panels, sharp `#333` borders, and monospace font).
* Live status badges, real-time routing previews (`• Route: auto`), response timers, token counters, and Google Material Symbols.
* Automatic route indicator reset on conversation delete, switch, or input clear.

---

## 🚀 Quick Start

### 1. Prerequisites
* [Node.js](https://nodejs.org/) (v18 or higher)
* [Ollama](https://ollama.com/) running locally (`http://localhost:11434`)

### 2. Recommended Local Models
Pull the recommended models in Ollama:

```bash
# Chat & Code specialist
ollama pull qwen2.5-coder:3b

# Multimodal Vision specialist
ollama pull qwen3-vl:2b

# Dense Vector Embedding model (for Semantic Routing & Mini-RAG)
ollama pull embeddinggemma-2:latest
```

### 3. Install & Run
Clone the repository and start the Vite development server:

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open `http://localhost:5173` in your browser.

> **Note on CORS**: The Vite development server automatically proxies `/api` and `/v1` requests to `http://localhost:11434`, eliminating any CORS configuration requirements on your local Ollama instance.

---

## 🛠️ Architecture & Core Modules

```
ollama-router/
├── AGENTS.md                  # High-level agent orchestration guidelines
├── src/
│   ├── AGENTS.md              # Folder-scoped source architecture rules
│   ├── main.js                # UI controller, event delegation, streaming renderer
│   ├── router.js              # Multi-engine decision routing & multimodal handler
│   ├── store.js               # Centralized pub/sub state manager (localStorage sync)
│   ├── ollama.js              # Ollama API client & multimodal payload sanitization
│   ├── rag.js                 # Mini-RAG document parser (PDF.js, JSON format, batching)
│   ├── vector.js              # Cosine similarity math, text chunking & LRU cache
│   ├── utils.js               # Formatting helpers & markdown parser
│   └── style.css              # Terminal cockpit design system
├── index.html                 # Single-page cockpit shell
├── vite.config.js             # Vite 8 reverse-proxy configuration
├── package.json               # Project manifest
└── LICENSE                    # MIT License
```

---

## ⚙️ Configuration & Custom Routes

You can customize routing rules directly in the **Routes** sidebar tab or in [src/store.js](file:///Users/abhijit/Documents/Projects/Learning/AI/ollama-router/src/store.js):

| Route ID | Category | Description / Keywords | Default Target |
|---|---|---|---|
| `route-code` | `code` | Python, JavaScript, debugging, algorithms, APIs | `qwen2.5-coder:3b` |
| `route-creative` | `creative` | Storytelling, poetry, fiction, creative writing | `qwen2.5-coder:3b` |
| `route-math` | `math` | Equations, calculus, statistics, algebra | `qwen3-vl:2b` |
| `route-analysis` | `analysis` | Comparative evaluation, trade-offs, reviews | `qwen2.5-coder:3b` |
| `route-vision` | `vision` | Images, photos, OCR, diagrams, multimodal tasks | `qwen3-vl:2b` |

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) — see the [LICENSE](LICENSE) file for details.
