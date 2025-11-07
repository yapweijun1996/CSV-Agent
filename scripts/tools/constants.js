export const TOOL_ALIASES = {
  'get_current_date': 'get_current_date',
  'clock.now': 'get_current_date',
  'time.now': 'get_current_date',
  'get_time': 'get_current_date',
  'js.run_sandbox': 'js.run_sandbox',
  'math.aggregate': 'math.aggregate'
};

export const TIME_INTENT_KEYWORDS = [
  'time',
  'date',
  'today',
  'now',
  '現在',
  '時間',
  '日期',
  '今天',
  'what time',
  'clock'
];

export const ARITHMETIC_INTENT_KEYWORDS = [
  'calculate',
  'calculation',
  'sum',
  'total',
  'add',
  'plus',
  'subtract',
  'minus',
  'multiply',
  'divide',
  'product',
  'quotient',
  '平均',
  '加',
  '減',
  '乘',
  '除',
  '總和'
];

export function normalizeToolName(rawName) {
  if (!rawName || typeof rawName !== 'string') {
    return null;
  }
  const key = rawName.trim().toLowerCase();
  return TOOL_ALIASES[key] || null;
}
