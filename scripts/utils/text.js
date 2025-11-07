const NUMBER_FORMATTER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });

export function clamp(value, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return min;
  }
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
}

export function formatResultValue(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return String(value);
    if (Math.abs(value) >= 1000) {
      return NUMBER_FORMATTER.format(value);
    }
    return String(value);
  }
  if (typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (Array.isArray(value)) {
    const preview = value.slice(0, 6).map(formatResultValue);
    const suffix = value.length > 6 ? ' …' : '';
    return `[${preview.join(', ')}${suffix}]`;
  }
  return safeStringify(value);
}
