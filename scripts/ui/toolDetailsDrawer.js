import { createElement } from '../utils/dom.js';
import { safeStringify } from '../utils/text.js';

let bodyEl;
let toggleBtn;
let expanded = false;
let onToggleCallback;

export function initToolDetailsDrawer({ body, toggle, defaultExpanded = false, onToggle }) {
  bodyEl = body;
  toggleBtn = toggle;
  expanded = defaultExpanded;
  onToggleCallback = typeof onToggle === 'function' ? onToggle : null;

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => setExpanded(!expanded));
  }
  setExpanded(expanded);
  clearToolDetails();
}

export function clearToolDetails() {
  if (!bodyEl) return;
  bodyEl.dataset.hasContent = 'false';
  bodyEl.innerHTML = '<p class="tool-details-empty">No tool executions yet.</p>';
}

export function renderToolDetails(entry) {
  if (!bodyEl || !entry) return;
  if (bodyEl.dataset.hasContent !== 'true') {
    bodyEl.innerHTML = '';
    bodyEl.dataset.hasContent = 'true';
  }

  const item = createElement('div', { className: 'tool-details-item' });
  const meta = createElement('div', { className: 'tool-details-meta' });
  const title = createElement('strong', { text: entry.tool || 'tool' });
  meta.appendChild(title);

  const status = createElement('span', {
    text: entry.status === 'succeeded'
      ? 'Status: executed'
      : `Status: failed (${entry.error?.code || 'runtime_error'})`
  });
  meta.appendChild(status);

  if (typeof entry.timeMs === 'number') {
    meta.appendChild(createElement('span', { text: `Time: ${entry.timeMs}ms` }));
  }

  if (typeof entry.timeoutMs === 'number') {
    meta.appendChild(createElement('span', { text: `Timeout: ${entry.timeoutMs}ms` }));
  }

  item.appendChild(meta);

  if (entry.reason) {
    item.appendChild(createElement('p', {
      className: 'tool-details-reason',
      text: `Plan reason: ${entry.reason}`
    }));
  }

  if (entry.tool === 'js.run_sandbox' && entry.input?.code) {
    item.appendChild(createCodeBlock('JS Code', entry.input.code));
    if (entry.input.args && Object.keys(entry.input.args).length > 0) {
      item.appendChild(createCodeBlock('Arguments', entry.input.args));
    }
  } else if (entry.input && Object.keys(entry.input).length > 0) {
    item.appendChild(createCodeBlock('Input', entry.input));
  }

  if (entry.status === 'succeeded') {
    if (entry.result !== undefined) {
      item.appendChild(createCodeBlock('Result', entry.result));
    }
    if (Array.isArray(entry.logs) && entry.logs.length) {
      item.appendChild(createCodeBlock('Console logs', entry.logs));
    }
    if (entry.stringified) {
      item.appendChild(createElement('p', { text: 'Result was stringified for safe rendering.' }));
    }
  } else if (entry.error?.detail) {
    item.appendChild(createCodeBlock('Error detail', entry.error.detail));
  }

  bodyEl.appendChild(item);
  setExpanded(true);
}

function createCodeBlock(label, value) {
  const wrapper = createElement('div', { className: 'tool-details-block' });
  wrapper.appendChild(createElement('p', { text: label }));
  const pre = createElement('pre');
  pre.textContent = typeof value === 'string' ? value : safeStringify(value);
  wrapper.appendChild(pre);
  return wrapper;
}

export function setExpanded(next) {
  expanded = Boolean(next);
  if (!bodyEl || !toggleBtn) return;
  bodyEl.classList.toggle('is-collapsed', !expanded);
  bodyEl.setAttribute('aria-hidden', expanded ? 'false' : 'true');
  toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  toggleBtn.textContent = expanded ? 'Hide' : 'Show';
  if (onToggleCallback) {
    onToggleCallback(expanded);
  }
}

export function isExpanded() {
  return expanded;
}
