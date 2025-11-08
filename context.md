# CSV Agent — Developer Context (Compact)

## Mission

Deliver a Vanilla JS front‑end agent that executes multi‑step tool plans sequentially, supports save_as aliases and $tool.<alias> references, hydrates placeholders into visible replies, exposes a math.aggregate helper for post‑processing, and surfaces a transparent audit trail (Thinking Log, Plan Board, Tool Details, Summary Bar, Progress HUD). Keep ES modules small and single‑responsibility.

## Architecture (Vanilla + ES Modules)

- Entry: [index.html](index.html), [scripts/app.js](scripts/app.js)
- API: [scripts/api/geminiClient.js](scripts/api/geminiClient.js), [scripts/api/connectionTester.js](scripts/api/connectionTester.js)
- State: [scripts/state/sessionState.js](scripts/state/sessionState.js), [scripts/state/memoryStore.js](scripts/state/memoryStore.js)
- Tools: [scripts/tools/planExecutor.js](scripts/tools/planExecutor.js), [scripts/tools/registry.js](scripts/tools/registry.js), [scripts/tools/sandboxRunner.js](scripts/tools/sandboxRunner.js), [scripts/tools/mathAggregate.js](scripts/tools/mathAggregate.js), [scripts/tools/constants.js](scripts/tools/constants.js)
- UI: [scripts/ui/chatView.js](scripts/ui/chatView.js), [scripts/ui/toolPlanPanel.js](scripts/ui/toolPlanPanel.js), [scripts/ui/toolDetailsDrawer.js](scripts/ui/toolDetailsDrawer.js), [scripts/ui/thinkingLog.js](scripts/ui/thinkingLog.js), [scripts/ui/progressHud.js](scripts/ui/progressHud.js), [scripts/ui/insightsPanel.js](scripts/ui/insightsPanel.js), [scripts/ui/summaryBar.js](scripts/ui/summaryBar.js), [scripts/ui/settingsModal.js](scripts/ui/settingsModal.js)
- Utils: [scripts/utils/jsonRepair.js](scripts/utils/jsonRepair.js), [scripts/utils/text.js](scripts/utils/text.js), [scripts/utils/dom.js](scripts/utils/dom.js), [scripts/utils/perf.js](scripts/utils/perf.js), [scripts/utils/objectPath.js](scripts/utils/objectPath.js), [scripts/utils/template.js](scripts/utils/template.js)

## Execution Model & Contract

- Plans execute strictly in order; on failure the run halts (no partial continuation).
- Each step has a save_as alias (auto _stepN if missing; inference is logged).
- Arguments may reference prior results using $tool.alias.path; resolver supports nested objects/arrays; missing references log a guard note and abort the plan.
- Plan board shows Planned → Executing → Done/Failed/Skipped with badges; the active card expands to show reasoning and resolved args.
- Host contract: when need_tool is true, visible_reply must include at least one placeholder that binds tool data; otherwise the turn is rejected before execution.

## Placeholder Hydration (Replies)

- Supports {{tool_result.*}} for the last tool and {{tool.<alias>.*}} for named results.
- Result normalization hoists result.* to top‑level and also preserves a .result snapshot for flat payloads, so both {{tool_result.local}} and {{tool_result.result.local}} resolve.
- Hydrator falls back to .result.* when a flattened property is missing, maintaining backward compatibility.
- Tools that don’t naturally return a .result object are wrapped so .result always exists, preventing unavailable placeholders.

## Sandbox & Tools

- [scripts/tools/sandboxRunner.js](scripts/tools/sandboxRunner.js) runs untrusted code with no network/storage, frozen globals, deep‑cloned inputs, and stringifies only on cloning failure to keep structured results addressable.
- Sandbox code snippet cap is 1000 characters.
- [scripts/tools/mathAggregate.js](scripts/tools/mathAggregate.js) provides sum/avg/min/max for post‑processing arrays (often used after a sandbox step).
- Tool registry exposes both sandbox and aggregate so plans can chain them safely.

## State & Memory

- IndexedDB‑backed memory captures recent turns (user input, restatement, reply, tool_plan).
- When present, API calls inject previous_intent, last_tool_plan, and a short history string to let follow‑ups reuse parameters (e.g., same but 24 months).
- Header provides Clear Memory to wipe the store; action is logged in the timeline.

## Telemetry & UI Surfaces

- turn.toolRuns captures tool, alias, raw/resolved args, start/end time, duration, status, and result or error; powers the Tool Details drawer and future telemetry.
- Thinking Log emits plan, tool, log, guard, error, and decide markers; serves as a replayable timeline.
- Tool Details auto‑expands for the active run while preserving prior runs.
- Summary Bar stays in sync with collapsible panels; states mirrored via aria‑expanded.
- [scripts/ui/insightsPanel.js](scripts/ui/insightsPanel.js) controls the visibility of the diagnostics stack (collapsed by default and persisted in localStorage).
- Chat composer remains focusable during execution; only the send button is disabled while isAgentBusy is true.
- [scripts/ui/progressHud.js](scripts/ui/progressHud.js) mirrors runner state (Listening → Executing step → Complete/Failed) with step count, active‑tool pill, and progress bar.

## Guardrails & JSON Repair

- [scripts/utils/jsonRepair.js](scripts/utils/jsonRepair.js) strips stray non‑ASCII glyphs outside quoted strings before applying comma/brace fixes to recover malformed JSON.
- Result normalization ensures structured results remain available for $tool.alias.result.* dereferences.

## Open TODOs

- Manual QA: savings‑projection scenario (clock → sandbox → aggregate), zero‑deposit case, and forced failure (bad code/timeout).
- Dark mode: introduce tokens and a UI toggle.

## Notes for Future Maintainers

- Keep modules ≤300–500 lines and focused on one responsibility; prefer small, composable functions and explicit exports.
- Avoid hardcoding business logic into the agent; prefer contracts (tool registry, plan schema, placeholder conventions).
- Update [README.md](README.md) when extending the tool contract or UI surfaces to keep onboarding cheap.
