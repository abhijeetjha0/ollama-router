/**
 * Ollama Router — Utilities
 */

/**
 * Format a file size from bytes to human-readable.
 * @param {number} bytes
 * @returns {string}
 */
export function formatSize(bytes) {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}

/**
 * Format milliseconds to human-readable duration.
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
  if (!ms) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Format a timestamp to a relative time string.
 * @param {number} timestamp
 * @returns {string}
 */
export function formatRelativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Escape HTML entities.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Simple markdown-like formatting for assistant messages.
 * Handles code blocks, inline code, bold, italic, and links.
 * @param {string} text
 * @returns {string}
 */
export function formatMarkdown(text) {
  let html = escapeHtml(text);

  // Code blocks (```...```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="lang-${lang}">${code}</code></pre>`;
  });

  // Inline code (`...`)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold (**...**)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic (*...*)
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Line breaks
  html = html.replace(/\n/g, '<br>');

  return html;
}

/**
 * Debounce a function.
 * @param {function} fn
 * @param {number} delay
 * @returns {function}
 */
export function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
