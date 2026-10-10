import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      // Proxy API requests to Ollama to avoid CORS issues
      '/api': {
        target: 'http://localhost:11434',
        changeOrigin: true,
      },
      // Proxy System 1 decision requests to Ollama
      '/v1': {
        target: 'http://localhost:11434',
        changeOrigin: true,
      },
    },
  },
});
