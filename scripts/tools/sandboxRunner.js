import { clamp, safeStringify } from '../utils/text.js';

const MAX_SANDBOX_CODE_CHARS = 1000;

export function sanitizeSandboxArgs(rawArgs) {
  const source = rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs) ? rawArgs : {};
  const code = typeof source.code === 'string' ? source.code.trim() : '';
  if (!code) {
    throw new Error('js.run_sandbox 需要 code 字串');
  }
  if (code.length > MAX_SANDBOX_CODE_CHARS) {
    throw new Error(`code 必須 <= ${MAX_SANDBOX_CODE_CHARS} 字元`);
  }

  let argsPayload = {};
  if (source.args && typeof source.args === 'object' && !Array.isArray(source.args)) {
    try {
      argsPayload = JSON.parse(JSON.stringify(source.args));
    } catch (cloneError) {
      throw new Error('args 需為可序列化物件');
    }
  } else if (source.args === undefined || source.args === null) {
    argsPayload = {};
  } else {
    throw new Error('args 必須為物件');
  }

  let timeoutMs = 500;
  if (typeof source.timeoutMs === 'number' && Number.isFinite(source.timeoutMs)) {
    timeoutMs = clamp(source.timeoutMs, 50, 1500);
  }

  return {
    code,
    args: argsPayload,
    timeoutMs
  };
}

export async function runSandboxSnippet(config) {
  if (typeof Worker === 'undefined') {
    const unavailable = new Error('sandbox worker unavailable');
    unavailable.code = 'sandbox_unavailable';
    throw unavailable;
  }

  const { worker, revokeUrl } = createSandboxWorker();

  return new Promise((resolve, reject) => {
    const logs = [];
    const start = performance?.now?.() ?? Date.now();
    let settled = false;

    const cleanup = () => {
      try {
        worker.terminate();
      } catch (error) {
        console.warn('sandbox termination failed:', error);
      }
      revokeUrl();
    };

    const finishSuccess = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      const timeMs = (performance?.now?.() ?? Date.now()) - start;
      const sanitized = sanitizeSandboxResult(value);
      resolve({
        result: sanitized.value,
        logs,
        timeMs: Number(timeMs.toFixed(2)),
        stringified: sanitized.stringified
      });
    };

    const finishError = (code, detail) => {
      if (settled) return;
      settled = true;
      cleanup();
      const error = new Error(detail || code);
      error.code = code || 'runtime_error';
      reject(error);
    };

    const timeoutId = setTimeout(() => {
      clearTimeout(timeoutId);
      finishError('timeout', `Exceeded ${config.timeoutMs}ms`);
    }, config.timeoutMs);

    worker.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === 'log') {
        logs.push(String(data.value ?? ''));
        return;
      }
      if (data.type === 'result') {
        clearTimeout(timeoutId);
        finishSuccess(data.value);
        return;
      }
      if (data.type === 'error') {
        clearTimeout(timeoutId);
        finishError(data.error || 'runtime_error', data.detail);
      }
    };

    worker.onerror = (event) => {
      clearTimeout(timeoutId);
      finishError('runtime_error', event.message || 'Worker error');
    };

    worker.postMessage({
      code: config.code,
      args: config.args
    });
  });
}

function createSandboxWorker() {
  const forbiddenApis = [
    'fetch',
    'XMLHttpRequest',
    'WebSocket',
    'importScripts',
    'indexedDB',
    'caches'
  ];
  const typedArrays = [
    'Int8Array', 'Uint8Array', 'Uint8ClampedArray',
    'Int16Array', 'Uint16Array',
    'Int32Array', 'Uint32Array',
    'Float32Array', 'Float64Array',
    'BigInt64Array', 'BigUint64Array'
  ];
  const frozenGlobals = [
    'Math',
    'Date',
    'Number',
    'String',
    'Array',
    'JSON',
    'BigInt',
    ...typedArrays
  ];

  const workerSource = `
    const FORBIDDEN = ${JSON.stringify(forbiddenApis)};
    function block(name) {
      const trap = function() {
        const error = new Error(name + ' is forbidden');
        error.code = 'forbidden_api';
        throw error;
      };
      try {
        self[name] = trap;
      } catch (error) {
        // no-op
      }
    }
    FORBIDDEN.forEach(block);

    if (self.navigator) {
      try { self.navigator = undefined; } catch (error) {}
    }

    const frozen = ${JSON.stringify(frozenGlobals)};
    frozen.forEach((name) => {
      if (self[name] && self[name].prototype) {
        Object.freeze(self[name].prototype);
      }
    });

    self.console = {
      log(...args) {
        self.postMessage({ type: 'log', value: args.map(String).join(' ') });
      }
    };

    self.onmessage = function(event) {
      const payload = event.data || {};
      const code = typeof payload.code === 'string' ? payload.code : '';
      const userArgs = payload.args;
      try {
        const fn = new Function('args', '"use strict";\\n' + code);
        const result = fn(userArgs);
        self.postMessage({ type: 'result', value: result });
      } catch (error) {
        const errorCode = error && error.code === 'forbidden_api' ? 'forbidden_api' : 'runtime_error';
        self.postMessage({
          type: 'error',
          error: errorCode,
          detail: error && error.message ? error.message : String(error)
        });
      }
    };
  `;

  const blob = new Blob([workerSource], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  let worker;
  try {
    worker = new Worker(url, { name: 'js-run-sandbox' });
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  return {
    worker,
    revokeUrl: () => URL.revokeObjectURL(url)
  };
}

function sanitizeSandboxResult(value) {
  if (value === undefined) {
    return { value: 'undefined', stringified: true };
  }
  if (value === null) {
    return { value: null, stringified: false };
  }
  const valueType = typeof value;
  if (valueType === 'object') {
    return { value: safeStringify(value), stringified: true };
  }
  if (valueType === 'function' || valueType === 'symbol') {
    return { value: String(value), stringified: true };
  }
  return { value, stringified: false };
}
