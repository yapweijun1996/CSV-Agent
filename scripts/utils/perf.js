export function markTime() {
  return performance.now();
}

export function elapsedSince(start) {
  if (typeof start !== 'number') return 0;
  return Math.round(performance.now() - start);
}
