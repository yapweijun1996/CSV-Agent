const turnHistory = [];
let activeTurn = null;

export function startNewTurn() {
  const turn = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    toolRuns: []
  };
  activeTurn = turn;
  turnHistory.push(turn);
  if (turnHistory.length > 10) {
    turnHistory.shift();
  }
  return turn;
}

export function finishTurn(turn) {
  if (activeTurn && turn && activeTurn.id === turn.id) {
    activeTurn = null;
  }
}

export function pushToolRun(turn, run) {
  if (!turn || !run) return;
  turn.toolRuns.push(run);
  return turn.toolRuns.length - 1;
}

export function updateToolRun(turn, index, patch) {
  if (!turn || typeof index !== 'number' || index < 0) return;
  const target = turn.toolRuns[index];
  if (!target) return;
  Object.assign(target, patch);
}

export function getTurnHistory() {
  return [...turnHistory];
}
