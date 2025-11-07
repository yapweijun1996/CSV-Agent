import { createElement } from '../utils/dom.js';
import { ARITHMETIC_INTENT_KEYWORDS, TIME_INTENT_KEYWORDS, normalizeToolName } from '../tools/constants.js';

const summaryButtons = new Set();

export function createSummaryData(response) {
  return {
    intent: inferIntent(response),
    status: 'planned',
    timestamp: new Date(),
    toolUsage: new Map(),
    totalDurationMs: 0,
    elements: null
  };
}

export function renderSummaryBar(summaryData, onToggle) {
  const button = createElement('button', {
    className: 'turn-summary-bar',
    attrs: {
      type: 'button',
      'aria-label': 'Toggle assistant details'
    }
  });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    if (typeof onToggle === 'function') {
      onToggle();
    }
  });

  const intent = createElement('span', {
    className: 'turn-summary-item turn-summary-intent',
    text: `${summaryData.intent.icon} ${summaryData.intent.label}`
  });

  const status = createElement('span', {
    className: 'turn-summary-item turn-summary-status is-planned',
    text: 'Planned'
  });

  const tools = createElement('span', {
    className: 'turn-summary-item turn-summary-tools',
    text: 'No tools'
  });

  const duration = createElement('span', {
    className: 'turn-summary-item turn-summary-duration',
    text: '0ms'
  });

  const timestamp = createElement('span', {
    className: 'turn-summary-item turn-summary-timestamp',
    text: summaryData.timestamp.toLocaleTimeString()
  });

  button.append(
    intent,
    createSeparator(),
    status,
    createSeparator(),
    tools,
    createSeparator(),
    duration,
    createSeparator(),
    timestamp
  );

  summaryData.elements = { root: button, status, tools, duration, timestamp };
  registerSummaryButton(button);
  return summaryData.elements;
}

export function updateSummaryStatus(summaryData, statusKey) {
  summaryData.status = statusKey;
  if (!summaryData.elements?.status) return;
  const stateMap = {
    planned: 'is-planned',
    executing: 'is-executing',
    succeeded: 'is-succeeded',
    failed: 'is-failed'
  };
  const className = stateMap[statusKey] || stateMap.planned;
  summaryData.elements.status.className = `turn-summary-item turn-summary-status ${className}`;
  summaryData.elements.status.textContent = statusKey === 'failed'
    ? 'Failed'
    : statusKey === 'succeeded'
      ? 'Executed'
      : statusKey === 'executing'
        ? 'Executing'
        : 'Planned';
}

export function recordToolUsage(summaryData, toolName, durationMs) {
  if (!summaryData) return;
  const total = (summaryData.toolUsage.get(toolName) || { count: 0, duration: 0 });
  total.count += 1;
  total.duration += durationMs || 0;
  summaryData.toolUsage.set(toolName, total);
  summaryData.totalDurationMs += durationMs || 0;
  updateToolsText(summaryData);
  updateDurationText(summaryData);
}

export function finalizeSummary(summaryData, succeeded) {
  updateSummaryStatus(summaryData, succeeded ? 'succeeded' : 'failed');
}

export function syncSummaryButtons(expanded) {
  summaryButtons.forEach((button) => {
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  });
}

function registerSummaryButton(button) {
  summaryButtons.add(button);
}

function createSeparator() {
  return createElement('span', { className: 'turn-summary-separator', text: '·' });
}

function updateToolsText(summaryData) {
  const element = summaryData.elements?.tools;
  if (!element) return;
  if (summaryData.toolUsage.size === 0) {
    element.textContent = 'No tools';
    return;
  }
  const parts = [];
  summaryData.toolUsage.forEach((info, tool) => {
    parts.push(`${tool} ×${info.count}`);
  });
  element.textContent = parts.join(', ');
}

function updateDurationText(summaryData) {
  const element = summaryData.elements?.duration;
  if (!element) return;
  element.textContent = `${summaryData.totalDurationMs}ms`;
}

function inferIntent(response) {
  const planEntries = Array.isArray(response?.tool_plan) ? response.tool_plan : [];
  const normalizedTools = planEntries
    .map((entry) => normalizeToolName(entry?.tool))
    .filter(Boolean);

  const haystack = [
    response?.restatement,
    response?.visible_reply,
    ...planEntries.map((entry) => entry?.reason || '')
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (normalizedTools.includes('js.run_sandbox') || ARITHMETIC_INTENT_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
    return { icon: '🔢', label: 'Arithmetic' };
  }

  if (normalizedTools.includes('get_current_date') || TIME_INTENT_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
    return { icon: '🕒', label: 'Clock' };
  }

  return { icon: '💬', label: 'General' };
}
