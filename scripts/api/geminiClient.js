import { repairJson } from '../utils/jsonRepair.js';
import { safeStringify } from '../utils/text.js';

export async function callGeminiApi(userInput, memoryContext = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key not found. Please set it in Settings.');
  }

  const model = localStorage.getItem('gemini-model') || 'gemini-pro';
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const systemPrompt = getSystemPrompt();

  const memoryPart = buildMemoryPart(memoryContext);

  const parts = [
    { text: systemPrompt },
    { text: `User input: ${userInput}` }
  ];
  if (memoryPart) {
    parts.push({ text: memoryPart });
  }

  const payload = {
    contents: [
      {
        parts
      }
    ],
    generationConfig: {
      response_mime_type: 'application/json'
    }
  };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(`API request failed: ${errorBody.error?.message || response.statusText}`);
  }

  const responseData = await response.json();
  const rawText = safeGet(responseData, ['candidates', 0, 'content', 'parts', 0, 'text'], 'candidates[0].content.parts[0].text');

  try {
    return validateGeminiResponse(JSON.parse(rawText));
  } catch (error) {
    const repaired = repairJson(rawText);
    if (repaired) {
      return validateGeminiResponse(repaired);
    }
    console.error('Gemini JSON parse failed', error, rawText);
    throw new Error('The model returned an invalid JSON response. Please try again.');
  }
}

function getApiKey() {
  return localStorage.getItem('gemini-api-key');
}

function buildMemoryPart(context) {
  if (!context || typeof context !== 'object') {
    return '';
  }
  const lines = [];
  if (context.lastIntent) {
    lines.push(`previous_intent: ${context.lastIntent}`);
  }
  if (Array.isArray(context.lastToolPlan) && context.lastToolPlan.length) {
    const planPreview = truncateText(safeStringify(context.lastToolPlan), 1200);
    lines.push(`last_tool_plan: ${planPreview}`);
  }
  if (Array.isArray(context.history) && context.history.length) {
    lines.push('recent_turns:');
    context.history.forEach((entry, index) => {
      const userLine = truncateText(entry.userInput || '', 200);
      const replyLine = truncateText(entry.visibleReply || '', 200);
      lines.push(`${index + 1}. user="${userLine}" -> reply="${replyLine}"`);
    });
  }
  if (!lines.length) {
    return '';
  }
  return [
    'Memory context (reuse parameters unless user overrides):',
    ...lines
  ].join('\n');
}

function truncateText(text, maxLength) {
  if (!text) return '';
  const str = String(text);
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength)}...`;
}

function safeGet(root, path, label) {
  if (!Array.isArray(path) || !path.length) {
    throw new Error('非預期回應：path 參數無效');
  }

  let current = root;
  for (const key of path) {
    const normalized = typeof key === 'number' ? key : String(key);
    if (current === null || current === undefined || !(normalized in current)) {
      const humanReadable = label || path.join('.');
      throw new Error(`非預期回應：缺少 ${humanReadable}`);
    }
    current = current[normalized];
  }
  return current;
}

function validateGeminiResponse(payload) {
  const errors = [];
  const sanitized = {
    restatement: '',
    visible_reply: '',
    thinking_log: [],
    tool_plan: []
  };

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('response 必須為物件');
  }

  const restatement = typeof payload.restatement === 'string' ? payload.restatement.trim() : '';
  if (!restatement) {
    errors.push('restatement 缺少或非字串');
  } else {
    sanitized.restatement = restatement;
  }

  const visibleReply = typeof payload.visible_reply === 'string' ? payload.visible_reply.trim() : '';
  if (!visibleReply) {
    errors.push('visible_reply 缺少或非字串');
  } else {
    sanitized.visible_reply = visibleReply;
  }

  if (!Array.isArray(payload.thinking_log)) {
    errors.push('thinking_log 必須為字串陣列');
  } else {
    payload.thinking_log.forEach((entry, index) => {
      if (typeof entry !== 'string') {
        errors.push(`thinking_log[${index}] 必須為字串`);
        return;
      }
      sanitized.thinking_log.push(entry.trim() || entry);
    });
  }

  if (!Array.isArray(payload.tool_plan) || payload.tool_plan.length === 0) {
    errors.push('tool_plan 必須包含至少一個步驟');
  } else {
    payload.tool_plan.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        errors.push(`tool_plan[${index}] 必須為物件`);
        return;
      }
      if (typeof entry.need_tool !== 'boolean') {
        errors.push(`tool_plan[${index}].need_tool 必須為布林值`);
      }
      const reason = typeof entry.reason === 'string' ? entry.reason.trim() : '';
      if (!reason) {
        errors.push(`tool_plan[${index}].reason 必須為字串`);
      }
      sanitized.tool_plan.push({
        ...entry,
        reason
      });
    });
  }

  if (errors.length) {
    throw new Error(`合約錯誤：${errors.join('、')}`);
  }
  return sanitized;
}

function getSystemPrompt() {
  return `You are the dialogue layer for an "ERP CSV Analyses Agent".
Your entire output MUST be a single JSON object (no prose, no markdown fences). Use this schema exactly:
{
  "restatement": "string",
  "visible_reply": "string",
  "thinking_log": ["string", "..."],
  "tool_plan": [
    { "need_tool": boolean, "tool": "string (optional)", "reason": "string", "args": "object (optional)", "save_as": "string (optional)" }
  ]
}

Guidelines:
1. Restate the user's intent in 'restatement'.
2. 'visible_reply' must be what the user will read. When you expect a tool result, reference placeholders so the host can inject data, e.g. "Current time is {{tool_result.local}} (ISO: {{tool_result.iso}})." or named variants like {{tool.schedule.result.balance}}.
3. 'thinking_log' is a concise step-by-step trace using bracketed tags such as "[read] ...", "[intent] ...", "[plan] ...", "[decide] ...".
4. 'tool_plan' ALWAYS contains at least one object describing your next action, and every executable step MUST include a unique 'save_as' so later steps can refer to it (e.g. "$tool.schedule.result.interestSeries").
5. 'visible_reply' must NEVER say you lack real-time data; rely on {{tool_result.*}} or {{tool.<save_as>.*}} placeholders instead of refusing.

About tools:
- Any tool you list WILL be executed by the host system. Do not claim you lack real-time capabilities; rely on the tool output instead.
- Supported tool ids: "get_current_date", "clock.now", "time.now", "get_time" (aliases of the same clock tool), "js.run_sandbox" for pure math/array/date snippets, and "math.aggregate" for deterministic number aggregation.
- When you use "js.run_sandbox", include an "args" object with: { "code": "string <=1000 chars", "args": { ...optional data... }, "timeoutMs": number <=1500 }. The snippet can use Math/Date/JSON/etc, must be synchronous, and should "return" the value you want to show via {{tool_result.result}} or named placeholders.
- Later steps can read the output of earlier tools by referencing "$tool.<save_as>.<path>" inside their args. Plan your sequence accordingly (e.g. sandbox → aggregation).
- "math.aggregate" accepts { "op": "sum|avg|min|max", "items": number[] } and returns { "value": number } so you can finish calculations without writing new JavaScript.
- Snippets cannot touch DOM, storage, network, or browser APIs such as fetch/XMLHttpRequest/WebSocket/importScripts/indexedDB/caches/navigator.*; attempting to do so will raise a forbidden_api error.
- When no tool is needed, set "need_tool": false and clearly explain why in "reason".
- When a tool is needed, set "need_tool": true, specify the tool id, describe what data you expect in the reply, and include "args" + the 'save_as' alias for downstream steps.

Contract enforcement:
- The host strictly validates this schema. Missing fields, wrong types, or empty tool plans will terminate the turn.
- Any user request for current date/time/clock (English or Chinese) MUST set "need_tool": true, choose one of the supported clock tool ids, and explain how its output will be used. Saying you cannot provide real-time data counts as a breach.
- Whenever "need_tool" is true you must include one of the supported tool ids ("get_current_date", "clock.now", "time.now", "get_time", "js.run_sandbox", "math.aggregate"). No other ids will run.
- If you truly do not need a tool, set "need_tool": false and provide a concrete, referenceable reason in "reason".

Never return explanatory text outside the JSON object.`;
}
