const STORAGE_KEY = 'csvAgent:insightsCollapsed';

let panelEl;
let bodyEl;
let toggleBtn;
let collapsed = false;

export function initInsightsPanel({ panel, body, toggle, defaultCollapsed = true }) {
  panelEl = panel;
  bodyEl = body;
  toggleBtn = toggle;
  collapsed = readStoredState(defaultCollapsed);

  if (!panelEl || !bodyEl || !toggleBtn) {
    return;
  }

  toggleBtn.addEventListener('click', () => setCollapsed(!collapsed));
  sync();
}

function setCollapsed(nextValue) {
  collapsed = Boolean(nextValue);
  persistState(collapsed);
  sync();
}

function sync() {
  if (!panelEl || !bodyEl || !toggleBtn) return;
  panelEl.classList.toggle('is-collapsed', collapsed);
  bodyEl.classList.toggle('is-hidden', collapsed);
  bodyEl.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
  toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  toggleBtn.textContent = collapsed ? 'Show details' : 'Hide details';
}

function readStoredState(defaultValue) {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) {
      return Boolean(defaultValue);
    }
    return stored === 'true';
  } catch (error) {
    return Boolean(defaultValue);
  }
}

function persistState(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
  } catch (error) {
    // ignore storage errors (e.g., privacy mode)
  }
}
