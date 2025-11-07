const SUPPORTED_OPS = new Set(['sum', 'avg', 'min', 'max']);

export function sanitizeAggregateArgs(rawArgs) {
  const source = rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)
    ? rawArgs
    : {};
  const op = typeof source.op === 'string' ? source.op.trim().toLowerCase() : '';
  if (!SUPPORTED_OPS.has(op)) {
    throw new Error('math.aggregate 需要 op: sum | avg | min | max');
  }
  if (!Array.isArray(source.items) || source.items.length === 0) {
    throw new Error('math.aggregate 需要至少一個 items 數值');
  }

  const items = source.items.map((value, index) => {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) {
      throw new Error(`items[${index}] 必須為有效數字`);
    }
    return num;
  });

  return { op, items };
}

export function aggregateNumbers({ op, items }) {
  if (!SUPPORTED_OPS.has(op) || !Array.isArray(items) || items.length === 0) {
    throw new Error('aggregateNumbers 參數無效');
  }
  switch (op) {
    case 'sum':
      return items.reduce((total, value) => total + value, 0);
    case 'avg':
      return items.reduce((total, value) => total + value, 0) / items.length;
    case 'min':
      return Math.min(...items);
    case 'max':
      return Math.max(...items);
    default:
      throw new Error(`不支援的 math.aggregate op: ${op}`);
  }
}
