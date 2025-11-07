import { createElement } from '../utils/dom.js';

let logList;
let toggleBtn;
let bodyEl;
let expanded = true;
let onToggleCallback;

export function initThinkingLog({ list, toggle, body, defaultExpanded = true, onToggle }) {
  logList = list;
  toggleBtn = toggle;
  bodyEl = body;
  expanded = defaultExpanded;
  onToggleCallback = typeof onToggle === 'function' ? onToggle : null;

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => setExpanded(!expanded));
  }
  setExpanded(expanded);
}

export function syncThinkingLog(entries = []) {
  if (!logList) return;
  logList.innerHTML = '';
  entries.forEach((entry) => appendThinkingLogEntry(entry));
}

export function appendThinkingLogEntry(entry) {
  if (!logList || !entry) return;
  const li = createElement('li');
  li.textContent = entry;
  logList.appendChild(li);
}

export function clearThinkingLog() {
  if (logList) {
    logList.innerHTML = '';
  }
}

export function setExpanded(nextState) {
  expanded = Boolean(nextState);
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
