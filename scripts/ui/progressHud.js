const DEFAULT_SUBTEXT = 'Waiting for your question';

let refs;
const hudState = {
  totalSteps: 0,
  completedSteps: 0
};

/**
 * Creates a thin controller so other modules can update the HUD
 * without touching DOM details, keeping responsibilities isolated.
 */
export function initProgressHud({ root, statusText, statusSubtext, progressText, progressFill, activeTool }) {
  refs = { root, statusText, statusSubtext, progressText, progressFill, activeTool };
  setIdle();
  return {
    setIdle,
    setListening,
    setPlanReady,
    setStepExecuting,
    setStepResult,
    setPlanComplete
  };
}

function setIdle() {
  hudState.totalSteps = 0;
  hudState.completedSteps = 0;
  updateDataset('idle');
  setStatus('Idle', DEFAULT_SUBTEXT);
  updateProgressLabel(0, 0);
  setProgressFill(0, 0);
  setActiveTool('—');
}

function setListening() {
  updateDataset('listening');
  setStatus('Listening', 'Preparing a plan…');
  setActiveTool('—');
}

function setPlanReady(totalSteps) {
  hudState.totalSteps = totalSteps;
  hudState.completedSteps = 0;
  updateDataset('planned');
  const detail = totalSteps ? `0/${totalSteps} steps queued` : 'Awaiting steps';
  setStatus('Plan ready', detail);
  updateProgressLabel(0, totalSteps);
  setProgressFill(0, totalSteps);
}

function setStepExecuting({ stepNumber, totalSteps, tool }) {
  if (typeof totalSteps === 'number') {
    hudState.totalSteps = totalSteps;
  }
  updateDataset('running');
  const total = hudState.totalSteps || totalSteps || 1;
  setStatus('Executing step', `Step ${stepNumber}/${total} in progress`);
  setActiveTool(tool || '—');
}

function setStepResult({ stepNumber, status }) {
  if (status === 'succeeded') {
    hudState.completedSteps = Math.max(hudState.completedSteps, Math.min(stepNumber, hudState.totalSteps || stepNumber));
    updateDataset('running');
    setStatus('Step completed', `Finished ${hudState.completedSteps}/${hudState.totalSteps || hudState.completedSteps} steps`);
  } else if (status === 'failed') {
    updateDataset('failed');
    const total = hudState.totalSteps || stepNumber;
    setStatus('Step failed', `Issue at step ${stepNumber}/${total}`);
  }
  updateProgressLabel(hudState.completedSteps, hudState.totalSteps);
  setProgressFill(hudState.completedSteps, hudState.totalSteps);
}

function setPlanComplete({ totalSteps, hasFailure }) {
  hudState.totalSteps = totalSteps;
  if (hasFailure) {
    updateDataset('failed');
    setStatus('Plan ended early', `Stopped at ${hudState.completedSteps}/${totalSteps} steps`);
  } else {
    hudState.completedSteps = totalSteps;
    updateDataset('succeeded');
    setStatus('Plan complete', `${totalSteps}/${totalSteps} steps succeeded`);
    setActiveTool('All done');
  }
  updateProgressLabel(hudState.completedSteps, hudState.totalSteps);
  setProgressFill(hudState.completedSteps, hudState.totalSteps);
}

function setStatus(title, subtext) {
  if (refs?.statusText) refs.statusText.textContent = title;
  if (refs?.statusSubtext) refs.statusSubtext.textContent = subtext;
}

function setActiveTool(text) {
  if (refs?.activeTool) refs.activeTool.textContent = text;
}

function updateProgressLabel(completed, total) {
  if (!refs?.progressText) return;
  if (!total) {
    refs.progressText.textContent = '0/0 steps';
    return;
  }
  refs.progressText.textContent = `${completed}/${total} steps`;
}

function setProgressFill(completed, total) {
  if (!refs?.progressFill) return;
  const ratio = !total ? 0 : Math.max(0, Math.min(1, completed / total));
  const pct = `${Math.round(ratio * 100)}%`;
  refs.progressFill.style.width = pct;
  refs.progressFill.style.setProperty('--hud-progress', pct);
}

function updateDataset(state) {
  if (refs?.root) {
    refs.root.dataset.state = state;
  }
}
