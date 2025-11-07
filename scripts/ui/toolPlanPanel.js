import { createElement } from '../utils/dom.js';
import { safeStringify } from '../utils/text.js';

let rootEl;
let listEl;
let summaryEl;
const stepViews = new Map();

export function initToolPlanPanel({ root, list, summary }) {
  rootEl = root;
  listEl = list;
  summaryEl = summary;
  showIdleState('Awaiting plan...');
}

export function showIdleState(text) {
  if (summaryEl) {
    summaryEl.textContent = text || 'Idle';
  }
  if (listEl) {
    listEl.innerHTML = '';
    listEl.appendChild(createElement('li', {
      className: 'plan-placeholder',
      text: 'No next step determined.'
    }));
  }
}

export function setPlanSteps(steps = []) {
  stepViews.clear();
  if (!listEl) return;
  listEl.innerHTML = '';
  steps.forEach((step, index) => {
    const item = createElement('li', { className: 'plan-step' });
    const header = createElement('div', { className: 'plan-step-header' });
    const badge = createElement('span', { className: 'plan-step-status plan-status-pending', text: 'Planned' });
    const title = createElement('div', { className: 'plan-step-title', text: step.title || `Step ${index + 1}` });
    const meta = createElement('span', { className: 'plan-step-meta', text: step.tool ? step.tool : 'No tool required' });
    header.append(badge, title, meta);

    const body = createElement('div', { className: 'plan-step-body is-collapsed' });
    if (step.reason) {
      body.appendChild(createElement('p', { text: step.reason }));
    }
    item.append(header, body);
    listEl.appendChild(item);

    stepViews.set(step.id, { item, badge, body, meta });
  });

  if (summaryEl) {
    summaryEl.textContent = `Plan ready: ${steps.length} steps`;
  }
}

export function updateStepStatus(stepId, status, details = {}) {
  const view = stepViews.get(stepId);
  if (!view) return;
  const statusMap = {
    pending: { label: 'Planned', className: 'plan-status-pending' },
    executing: { label: 'Executing', className: 'plan-status-executing' },
    succeeded: { label: 'Executed', className: 'plan-status-succeeded' },
    failed: { label: 'Failed', className: 'plan-status-failed' },
    skipped: { label: 'Skipped', className: 'plan-status-skipped' }
  };
  const config = statusMap[status] || statusMap.pending;
  view.badge.textContent = config.label;
  view.badge.className = `plan-step-status ${config.className}`;
  view.body.classList.toggle('is-collapsed', status !== 'executing');
  if (details.message) {
    view.body.innerHTML = '';
    view.body.appendChild(createElement('p', { text: details.message }));
  }
  if (details.resolvedArgs) {
    view.body.appendChild(createCodeBlock('Resolved args', details.resolvedArgs));
  }
  if (summaryEl) {
    summaryEl.textContent = details.summaryText || summaryEl.textContent;
  }
}

export function markPlanComplete({ totalSteps, hasFailure }) {
  if (!summaryEl) return;
  if (!totalSteps) {
    summaryEl.textContent = 'Plan complete';
    return;
  }
  summaryEl.textContent = hasFailure
    ? `Plan finished with issues (${totalSteps} steps)`
    : `Plan complete (${totalSteps} steps)`;
}

function createCodeBlock(label, value) {
  const block = createElement('div', { className: 'plan-step-block' });
  block.appendChild(createElement('p', { text: label }));
  const pre = createElement('pre');
  pre.textContent = typeof value === 'string' ? value : safeStringify(value);
  block.appendChild(pre);
  return block;
}
