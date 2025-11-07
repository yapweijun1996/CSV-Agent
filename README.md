# CSV Agent (Vanilla Frontend)

A pure HTML/CSS/JS front-end that talks to Gemini, enforces a JSON contract, and behaves like an iterative worker: it restates the request, shows its thinking log, drafts a tool plan, and (now) executes supported tools while keeping the UI transparent for engineers and users.

## Layout & Files

- `index.html` – Static workspace layout (main panel, assistant sidebar, Next Step board, Tool Details drawer, settings modal) plus a single `<script type="module">` entry point.
- `style.css` – Tokens + responsive component styles (summary pill, multi-step board, resizer, collapsible panels, tool-result stack).
- `scripts/` – ES module tree, each file ≤200 lines and scoped to one role:
  - `app.js` – Entry point that wires DOM events, Gemini calls, and tool execution.
  - `api/geminiClient.js` – Fetch wrapper, system prompt, JSON repair, schema validation.
  - `state/sessionState.js` – Turn bookkeeping + `toolRuns` mutations.
  - `ui/*.js` – View-specific controllers (`chatView`, `thinkingLog`, `toolPlanPanel`, `toolDetailsDrawer`, `summaryBar`, `settingsModal`, `resizer`).
  - `tools/planExecutor.js` – Multi-step plan runner with save-as registry, variable resolver, telemetry logging.
  - `tools/registry.js` & `tools/sandboxRunner.js` – Tool definitions and secure worker harness.
  - `utils/*.js` – Shared helpers (DOM, perf, JSON repair, template hydration, deep-path access, text formatting).
- `context.md` – Live notebook containing the current goal/TODO/notes/progress for the engineering session.
- `AGENTS.md` – Product rules and operating instructions the agent must follow.

## Runtime Flow (Iterative Worker)

1. **Diagnose** – `handleSend()` captures the user's question, logs it in chat, clears the thinking panel, and disables inputs so only one action runs at a time.
2. **Plan** – Gemini is prompted (see `getSystemPrompt()`) to return `restatement`, `visible_reply`, `thinking_log[]`, and a `tool_plan[]`. We parse/repair JSON strictly before touching the UI.
3. **Execute** – `renderLlmResponse()` streams the sanitized `tool_plan[]` into the plan executor, which now behaves like an iterative worker:
   - Every entry receives a unique `save_as` (auto `_stepN` if missing) and renders inside the Next Step list with a badge that flows Planned → Executing → Executed/Failed/Skipped.
   - Step args are deep-cloned and passed through a mini resolver so strings like `$tool.schedule.result.balance` can borrow results from earlier steps.
   - Tool invocations run strictly sequentially; on each start we log `[tool] Step i/n <name> start`, update the timeline, and stamp the Tool Details drawer with resolved args.
   - Failures halt the remainder of the plan, annotate skipped tasks, and surface a friendly summary (“Plan finished with issues”) while re-enabling chat input.
4. **Log** – While a tool runs, the Thinking Log doubles as the timeline, detailing start/done/error events with measured durations, console logs, and guard notes (stringified objects, missing refs, security denials). The Tool Details drawer expands automatically for the active step so engineers can audit code/args/results without DevTools.
5. **Verify** – Chat bubbles append `Step i/n · Result:` rows for every tool, visible replies hydrate placeholders (`{{tool_result.*}}` and `{{tool.someStep.result.*}}`), and `turn.toolRuns[]` stores `{ tool, saveAs, argsResolved, startedAt, endedAt, timeMs, status, result|error }` for downstream telemetry. The Turn Summary Bar stays in sync with the collapsible panels and reflects aggregate tool counts/durations plus the final status badge.

## Response Guardrails

- **`safeGet()` path validator** – `callGeminiApi()` now walks `candidates[0].content.parts[0].text` via a shared helper that throws `非預期回應` whenever Gemini returns a refusal/safety card without those fields. This keeps the UI from attempting to read `undefined.text` and lets the same error path surface a clear message to users.
- **JSON repair fallback** – If the returned text is malformed JSON, we slice between the first `{` and last `}` and now run light heuristics (remove dangling commas, insert missing commas for string arrays) before showing an error bubble.
- **Schema validation (`validateGeminiResponse`)** – After parsing (or repairing) the JSON, we check that every property matches the contract: `restatement`/`visible_reply` must be non-empty strings, `thinking_log` must be a string array, and `tool_plan` must contain at least one `{ need_tool, reason }` object with valid types. Violations throw `合約錯誤：…` so the UI cannot render partial/invalid data.
- **Prompt hardening** – `getSystemPrompt()` now spells out the same enforcement rules to Gemini: time/date requests require `need_tool=true` plus a supported clock tool id, `visible_reply` must not apologize about lacking real-time data, and omitting the tool id when `need_tool=true` is treated as a breach. This keeps the model aligned with the front-end contract.

## Tool Execution Details

- **Registry-first design** – `tools/registry.js` exposes pure tool definitions. Each entry returns `prepareInput()` (arg sanitization) and `run()` (async executor). `get_current_date` shares aliases across `get_current_date`, `clock.now`, `time.now`, `get_time`; `js.run_sandbox` funnels code through a hardened worker.
- **Sandbox guardrails** – `tools/sandboxRunner.js` enforces ≤1000 char snippets, JSON-serializable args, and a 50–1500 ms timeout. Workers strip network/storage APIs, freeze whitelisted globals, capture console output, and stringify any complex return values so UI rendering stays safe.
- **Save-as & dependency graph** – Every plan item may declare `save_as`. The executor assigns `_stepN` when missing, caches `{ result, status, error }`, and exposes them to later steps via `$tool.<save_as>.<path>` placeholders. Missing refs immediately raise `[guard] missing ref ...` and stop the plan.
- **Placeholder hydration** – Replies can now mix legacy `{{tool_result.local}}` tokens (last tool result) with scoped placeholders like `{{tool.schedule.result.balance}}`. The hydrator walks nested paths and falls back to `unavailable` so user-facing text always reflects actual data.
- **Telemetry** – Each tool run writes to `turn.toolRuns[]`, the thinking log (start/done/error/duration/logs), Tool Details, and the Next Step list in lockstep. Timeline rows cap previews to ~2 KB to keep the UI responsive even when sandbox code returns arrays.
- **Failure handling** – Any error (bad args, forbidden API, timeout) halts the plan, stamps the remaining steps as `Skipped`, reuses the fallback placeholder value (`unavailable`), and leaves Tool Details expanded on the point-of-failure entry for quick debugging.

## UI / UX Notes

- **Assistant resizer** – Accessible drag/keyboard resizing between main content and assistant sidebar with live logging (`[layout] ...`). Width is clamped between 280–640px.
- **Turn Summary Bar** – Every assistant reply begins with a single-line bar that shows the inferred intent (with icon), plan status (Planned/Executed/Failed badge), aggregate tool usage (`js.run_sandbox ×2`), total tool duration, and the local timestamp. The whole bar is a button (Enter/Space friendly) that toggles the Thinking Log + Tool Details panes in sync so users can jump between “skim view” and “full telemetry” without hunting for separate controls.
- **Timeline = Thinking Log** – The `<ul>` in the sidebar doubles as a chronological trace of LLM reasoning plus system/tool events, so observers can audit decisions without checking devtools. The log header now has a Hide/Show toggle so users can collapse the trace when they only care about the final answer.
- **Next Step card** – Shows the current `tool_plan` summary, spinner while executing, and final status (“Executed” / “Failed” / “Unsupported” / “No tool needed”). This mirrors the update_plan approach described in `context.md`.
- **Tool Details drawer** – Each tool execution populates a collapsible panel with its metadata. For `js.run_sandbox` runs we render the exact code, args payload, timeout, logs, result, and guard notes so users can inspect what ran without opening DevTools.
- **Settings modal** – Stores the Gemini API key + model in `localStorage`; no backend is required.

## Extending the Agent

- Add more tools by extending `TOOL_REGISTRY` (each entry exposes `run()` and can log additional metadata into `toolRuns`). Update the alias map and keyword heuristic as needed.
- Inject richer timeline styling or card components purely via `style.css`; avoid frameworks per project rules.
- Keep `context.md` + this README updated whenever the workflow changes so the next engineer can reason about multi-step execution without spelunking through the entire script.

The project deliberately stays framework-free; every iteration should respect the small-step, log-everything mentality so both engineers and users can trust what the agent is doing.
