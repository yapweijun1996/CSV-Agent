import { normalizeToolName, TIME_INTENT_KEYWORDS } from './constants.js';
import { hydrateReplyTemplate } from '../utils/template.js';
import { formatResultValue, safeStringify } from '../utils/text.js';
import { getDeepValue } from '../utils/objectPath.js';
import { markTime, elapsedSince } from '../utils/perf.js';
import { pushToolRun, updateToolRun } from '../state/sessionState.js';

const TOOL_REF_REGEX = /^\$tool\.([a-zA-Z0-9_\-]+)(?:\.(.+))?$/;

export function createPlanExecutor({ toolRegistry }) {
  if (!toolRegistry) throw new Error('toolRegistry is required');
  return async function runToolPlan(planEntries, runtime) {
    if (!Array.isArray(planEntries) || planEntries.length === 0) {
      runtime.planPanel.showIdleState('No next step determined.');
      runtime.hud?.setIdle?.();
      return 'succeeded';
    }

    runtime.hud?.setPlanReady?.(planEntries.length);
    runtime.appendThinkingLog(`[plan] 準備執行 ${planEntries.length} 步`);
    runtime.summary.updateStatus('executing');
    const planSteps = planEntries.map((entry, index) => createPlanStep(entry, index, planEntries.length, runtime.appendThinkingLog));
    runtime.planPanel.setPlanSteps(planSteps.map((step) => step.view));

    const namedResults = new Map();
    let lastToolResult = null;
    let encounteredFailure = false;

    for (let index = 0; index < planEntries.length; index++) {
      const stepEntry = planEntries[index];
      const { stepInfo } = planSteps[index];
      const status = await runSinglePlanStep(stepEntry, {
        ...runtime,
        stepInfo,
        namedResults,
        getLastToolResult: () => lastToolResult,
        setLastToolResult: (value) => {
          lastToolResult = value;
        }
      }, toolRegistry);

      if (status === 'failed') {
        encounteredFailure = true;
        markRemainingStepsAsSkipped(planSteps, index + 1, runtime.planPanel);
        break;
      }
    }

    runtime.planPanel.markPlanComplete({
      totalSteps: planEntries.length,
      hasFailure: encounteredFailure
    });
    runtime.hud?.setPlanComplete?.({
      totalSteps: planEntries.length,
      hasFailure: encounteredFailure
    });
    runtime.summary.finalize(!encounteredFailure);
    hydrateReply(runtime, { namedResults, lastToolResult });
    return encounteredFailure ? 'failed' : 'succeeded';
  };
}

async function runSinglePlanStep(planEntry, runtime, toolRegistry) {
  const { stepInfo } = runtime;
  const reason = planEntry.reason || 'No specific reason provided.';
  runtime.appendThinkingLog(`[plan] ${stepInfo.label} - ${reason}`);
  runtime.hud?.setStepExecuting?.({
    stepNumber: stepInfo.index + 1,
    totalSteps: stepInfo.total,
    tool: planEntry.need_tool ? (planEntry.tool || 'selecting tool') : 'No tool needed'
  });

  if (!planEntry.need_tool) {
    runtime.planPanel.updateStepStatus(stepInfo.id, 'succeeded', {
      message: `No tool needed - ${reason}`
    });
    runtime.appendThinkingLog(`[decide] ${stepInfo.label} 無需工具`);
    runtime.appendToolResult && runtime.appendToolResult({
      prefix: stepInfo.label,
      label: 'Note',
      value: reason
    });
    runtime.hud?.setStepResult?.({
      stepNumber: stepInfo.index + 1,
      status: 'succeeded'
    });
    return 'succeeded';
  }

  const resolvedTool = resolveToolFromPlan(planEntry, runtime.response, runtime.userInput);
  if (!resolvedTool) {
    runtime.appendThinkingLog(`[warn] unsupported tool: ${planEntry.tool || 'unspecified'}`);
    runtime.planPanel.updateStepStatus(stepInfo.id, 'failed', {
      message: `Unsupported tool: ${planEntry.tool || 'unspecified'}`
    });
    runtime.appendToolResult && runtime.appendToolResult({
      prefix: stepInfo.label,
      value: 'unavailable',
      isError: true
    });
    runtime.summary.updateStatus('failed');
    runtime.hud?.setStepResult?.({
      stepNumber: stepInfo.index + 1,
      status: 'failed'
    });
    return 'failed';
  }

  const tool = toolRegistry[resolvedTool.name];
  if (!tool) {
    runtime.appendThinkingLog(`[warn] 未註冊工具: ${resolvedTool.name}`);
    runtime.planPanel.updateStepStatus(stepInfo.id, 'failed', {
      message: `Tool not registered: ${resolvedTool.name}`
    });
    runtime.appendToolResult && runtime.appendToolResult({
      prefix: stepInfo.label,
      value: 'unavailable',
      isError: true
    });
    runtime.summary.updateStatus('failed');
    runtime.hud?.setStepResult?.({
      stepNumber: stepInfo.index + 1,
      status: 'failed'
    });
    return 'failed';
  }

  const { value: resolvedArgs, errors: refErrors } = resolveArgReferences(planEntry.args, runtime.namedResults);
  if (refErrors.length) {
    const missingRef = refErrors.join(', ');
    runtime.appendThinkingLog(`[guard] missing ref ${missingRef}`);
    runtime.planPanel.updateStepStatus(stepInfo.id, 'failed', {
      message: `Missing ref: ${missingRef}`
    });
    runtime.appendToolResult && runtime.appendToolResult({
      prefix: stepInfo.label,
      value: 'unavailable',
      isError: true
    });
    runtime.summary.updateStatus('failed');
    runtime.hud?.setStepResult?.({
      stepNumber: stepInfo.index + 1,
      status: 'failed'
    });
    return 'failed';
  }

  let toolInput;
  try {
    toolInput = tool.prepareInput
      ? tool.prepareInput({ ...planEntry, args: resolvedArgs })
      : (resolvedArgs || {});
  } catch (inputError) {
    runtime.appendThinkingLog(`[error] ${resolvedTool.name} args invalid`);
    runtime.planPanel.updateStepStatus(stepInfo.id, 'failed', {
      message: inputError.message
    });
    runtime.appendToolResult && runtime.appendToolResult({
      prefix: stepInfo.label,
      value: 'unavailable',
      isError: true
    });
    runtime.toolDetails?.render({
      tool: resolvedTool.name,
      status: 'failed',
      reason,
      input: resolvedArgs,
      error: { code: 'args_invalid', detail: inputError.message }
    });
    runtime.summary.updateStatus('failed');
    runtime.hud?.setStepResult?.({
      stepNumber: stepInfo.index + 1,
      status: 'failed'
    });
    return 'failed';
  }

  runtime.planPanel.updateStepStatus(stepInfo.id, 'executing', {
    message: `Tool: ${resolvedTool.name}`,
    resolvedArgs: resolvedArgs
  });
  runtime.appendThinkingLog(`[tool] ${stepInfo.label} ${resolvedTool.name} start`);

  const runIndex = pushToolRun(runtime.turn, {
    id: stepInfo.id,
    save_as: stepInfo.id,
    tool: resolvedTool.name,
    argsRaw: planEntry.args || null,
    argsResolved: toolInput,
    status: 'started',
    startedAt: Date.now()
  });

  const start = markTime();
  try {
    const rawResult = await tool.run(toolInput);
    const duration = elapsedSince(start);
    updateToolRun(runtime.turn, runIndex, {
      status: 'succeeded',
      result: rawResult,
      endedAt: Date.now(),
      timeMs: duration
    });
    runtime.summary.recordUsage(resolvedTool.name, duration);

    const formattedResult = formatToolResult(resolvedTool.name, rawResult);
    runtime.appendThinkingLog(`[tool] ${resolvedTool.name} done (${duration}ms)`);
    if (Array.isArray(rawResult?.logs) && rawResult.logs.length) {
      runtime.appendThinkingLog(`[log] ${safeStringify(rawResult.logs).slice(0, 200)}`);
    }
    if (rawResult?.stringified) {
      runtime.appendThinkingLog('[guard] stringified result');
    }
    runtime.appendThinkingLog('[decide] fulfilled');
    runtime.appendToolResult && runtime.appendToolResult({
      prefix: stepInfo.label,
      value: formattedResult
    });
    runtime.planPanel.updateStepStatus(stepInfo.id, 'succeeded', {
      message: `${resolvedTool.name} (${duration}ms)`
    });
    runtime.toolDetails?.render({
      tool: resolvedTool.name,
      status: 'succeeded',
      reason,
      input: toolInput,
      result: rawResult,
      logs: rawResult?.logs,
      timeMs: typeof rawResult?.timeMs === 'number' ? rawResult.timeMs : duration,
      timeoutMs: toolInput?.timeoutMs,
      stringified: Boolean(rawResult?.stringified)
    });

    const placeholderRecord = createNamedResultRecord(resolvedTool.name, rawResult);
    runtime.namedResults.set(stepInfo.id, placeholderRecord);
    runtime.hud?.setStepResult?.({
      stepNumber: stepInfo.index + 1,
      status: 'succeeded'
    });
    runtime.setLastToolResult(placeholderRecord);
    hydrateReply(runtime, {
      namedResults: runtime.namedResults,
      lastToolResult: placeholderRecord
    });
    return 'succeeded';
  } catch (error) {
    const duration = elapsedSince(start);
    const errorCode = error?.code || 'runtime_error';
    const detailMessage = error?.message || 'unknown error';
    updateToolRun(runtime.turn, runIndex, {
      status: 'failed',
      error: { code: errorCode, detail: detailMessage },
      endedAt: Date.now(),
      timeMs: duration
    });
    runtime.summary.recordUsage(resolvedTool.name, duration);
    runtime.summary.updateStatus('failed');
    runtime.appendThinkingLog(`[error] ${resolvedTool.name} ${errorCode}`);
    runtime.appendToolResult && runtime.appendToolResult({
      prefix: stepInfo.label,
      value: 'unavailable',
      isError: true
    });
    runtime.planPanel.updateStepStatus(stepInfo.id, 'failed', {
      message: `${resolvedTool.name} (${errorCode})`
    });
    runtime.toolDetails?.render({
      tool: resolvedTool.name,
      status: 'failed',
      reason,
      input: toolInput,
      error: { code: errorCode, detail: detailMessage },
      timeMs: duration,
      timeoutMs: toolInput?.timeoutMs
    });

    runtime.namedResults.set(stepInfo.id, {
      status: 'failed',
      error: { code: errorCode, detail: detailMessage },
      tool: resolvedTool.name
    });
    runtime.hud?.setStepResult?.({
      stepNumber: stepInfo.index + 1,
      status: 'failed'
    });
    hydrateReply(runtime, {
      namedResults: runtime.namedResults,
      lastToolResult: runtime.getLastToolResult(),
      fallbackValue: 'unavailable'
    });
    return 'failed';
  }
}

function hydrateReply(runtime, { namedResults, lastToolResult, fallbackValue }) {
  if (!runtime.replyTemplate || !runtime.setReplyText) return;
  const hydrated = hydrateReplyTemplate(runtime.replyTemplate, {
    namedResults,
    lastToolResult,
    fallbackValue
  });
  runtime.setReplyText(hydrated);
}

function resolveToolFromPlan(planEntry, response, userInput) {
  const normalized = normalizeToolName(planEntry.tool);
  if (normalized) {
    return { name: normalized, inferred: false };
  }
  if (!planEntry.need_tool) {
    return null;
  }

  const text = aggregateIntentText(planEntry, response, userInput);
  const matchesIntent = TIME_INTENT_KEYWORDS.some((keyword) => text.includes(keyword));
  if (matchesIntent) {
    return { name: 'get_current_date', inferred: true };
  }
  return null;
}

function aggregateIntentText(planEntry, response, userInput) {
  return [
    planEntry.reason,
    response?.restatement,
    response?.visible_reply,
    userInput
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function formatStepLabel(index, total) {
  return `Step ${index + 1}/${total}`;
}

function getStepId(planEntry, index) {
  if (typeof planEntry.save_as === 'string' && planEntry.save_as.trim()) {
    return planEntry.save_as.trim();
  }
  return `_step${index + 1}`;
}

function createPlanStep(entry, index, total, appendThinkingLog) {
  const hasSaveAs = typeof entry.save_as === 'string' && entry.save_as.trim().length > 0;
  const id = getStepId(entry, index);
  if (!hasSaveAs && typeof appendThinkingLog === 'function') {
    appendThinkingLog(`[guard] auto save_as=${id}`);
  }
  const view = {
    id,
    title: formatStepLabel(index, total),
    tool: entry.need_tool ? (entry.tool || 'unspecified') : 'No tool',
    reason: entry.reason || ''
  };
  return {
    view,
    stepInfo: { id, index, total, label: view.title }
  };
}

function markRemainingStepsAsSkipped(planSteps, startIndex, planPanel) {
  for (let i = startIndex; i < planSteps.length; i++) {
    const stepId = planSteps[i].stepInfo.id;
    planPanel.updateStepStatus(stepId, 'skipped', {
      message: 'Skipped due to earlier failure'
    });
  }
}

function createNamedResultRecord(toolName, rawResult) {
  const placeholderPayload = buildPlaceholderPayload(rawResult);
  return {
    ...placeholderPayload,
    tool: toolName,
    status: 'succeeded'
  };
}

function buildPlaceholderPayload(rawResult) {
  if (rawResult === null || rawResult === undefined) {
    return { value: rawResult, result: rawResult };
  }
  if (Array.isArray(rawResult)) {
    const clone = rawResult.slice();
    if (clone.result === undefined) {
      clone.result = Array.isArray(rawResult.result) ? rawResult.result.slice() : rawResult.slice();
    }
    return clone;
  }
  if (typeof rawResult !== 'object') {
    return { value: rawResult, result: rawResult };
  }
  const clone = { ...rawResult };
  if (rawResult.result && typeof rawResult.result === 'object' && !Array.isArray(rawResult.result)) {
    Object.entries(rawResult.result).forEach(([key, value]) => {
      if (!(key in clone)) {
        clone[key] = value;
      }
    });
  }
  if (clone.result === undefined) {
    clone.result = rawResult;
  }
  return clone;
}

function resolveArgReferences(args, namedResults) {
  if (!args || typeof args !== 'object') {
    return { value: args, errors: [] };
  }
  const errors = [];

  const resolveValue = (value) => {
    if (typeof value === 'string') {
      const match = value.match(TOOL_REF_REGEX);
      if (match) {
        const saveAs = match[1];
        const path = match[2];
        const source = namedResults.get(saveAs);
        if (!source) {
          errors.push(`$tool.${saveAs}`);
          return null;
        }
        if (!path) {
          return source.result ?? source;
        }
        const resolved = getDeepValue(source, path.split('.'));
        if (resolved === undefined) {
          errors.push(`$tool.${saveAs}.${path}`);
          return null;
        }
        return resolved;
      }
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => resolveValue(item));
    }
    if (value && typeof value === 'object') {
      const clone = {};
      Object.entries(value).forEach(([key, child]) => {
        clone[key] = resolveValue(child);
      });
      return clone;
    }
    return value;
  };

  const resolvedValue = resolveValue(args);
  return { value: resolvedValue, errors };
}

function formatToolResult(toolName, result) {
  if (!result) return 'unavailable';
  if (toolName === 'js.run_sandbox') {
    const value = formatResultValue(result.result);
    const timeSuffix = typeof result.timeMs === 'number' ? ` (${result.timeMs}ms)` : '';
    const logsSuffix = Array.isArray(result.logs) && result.logs.length
      ? ` logs=${formatResultValue(result.logs)}`
      : '';
    return `${value}${timeSuffix}${logsSuffix}`.trim();
  }
  if (result.local) return result.local;
  if (result.iso) return result.iso;
  if (typeof result.epochMs === 'number') return String(result.epochMs);
  return safeStringify(result);
}
