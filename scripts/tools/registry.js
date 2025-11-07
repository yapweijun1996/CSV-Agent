import { sanitizeSandboxArgs, runSandboxSnippet } from './sandboxRunner.js';
import { sanitizeAggregateArgs, aggregateNumbers } from './mathAggregate.js';

export function createToolRegistry() {
  return {
    get_current_date: {
      label: 'get_current_date',
      prepareInput() {
        return {};
      },
      async run() {
        const now = new Date();
        return {
          iso: now.toISOString(),
          local: now.toLocaleString(),
          epochMs: now.getTime()
        };
      }
    },
    'js.run_sandbox': {
      label: 'js.run_sandbox',
      prepareInput(planEntry) {
        return sanitizeSandboxArgs(planEntry?.args);
      },
      async run(payload) {
        return runSandboxSnippet(payload);
      }
    },
    'math.aggregate': {
      label: 'math.aggregate',
      prepareInput(planEntry) {
        return sanitizeAggregateArgs(planEntry?.args);
      },
      async run(payload) {
        return {
          value: aggregateNumbers(payload)
        };
      }
    }
  };
}
