# CSV Agent – Multi-Step Tool Runner Upgrade

## Goal

Deliver a Vanilla JS front-end that acts like a transparent, iterative worker: the agent must execute every `tool_plan` step sequentially, support `save_as` aliases + `$tool.*` references, hydrate named placeholders in the visible reply, expose a `math.aggregate` helper for post-processing sandbox output, and surface a detailed audit trail (thinking log, plan board, tool details, summary bar, execution HUD) while keeping the codebase modular (`type="module"`, single-responsibility files ≤300 lines).

## TODO

- [x] Split the legacy 1.8k-line script into ES modules (`scripts/` tree) covering API, state, UI, tooling, and utilities.
- [x] Replace the Next Step text block with a multi-step board showing Planned → Executing → Executed/Failed/Skipped (with badges + auto-expansion).
- [x] Implement the save-as registry, `$tool.<alias>.<path>` resolver, sequential runner, and halt-on-failure guardrails.
- [x] Hydrate replies with both `{{tool_result.*}}` (last result) and `{{tool.<alias>.*}}`, plus fallback `unavailable`.
- [x] Update README + context to document the new architecture/contract so future engineers can maintain it cheaply.
- [x] Visual polish pass: Progress HUD, refreshed chat/composer skin, plan badge micro-transitions.
- [x] Fix reply placeholder hydration for sandbox/math results so `{{tool_result.balance}}` style tokens stop rendering `unavailable` when the returned data lives under `result.*`.
- [ ] Manual QA: run the savings-projection scenario (clock + sandbox + aggregate), zero-deposit case, and forced failure (bad code / timeout) once time permits.
- [ ] Dark-mode tokens + toggle to round out the refreshed look.
- [x] Conversation memory: persist prior turn parameters (start balance, deposit, APR, horizon, etc.) so follow-up prompts like “same but 24 months” can reuse context. Explore lightweight storage (in-memory queue vs. IndexedDB) that still respects the no-backend constraint.

## Notes

- Each plan step is assigned `save_as` (auto `_stepN` if missing, with `[guard] auto save_as=…` logged) and rendered in `tool_plan_list`; badges change color as states evolve and the active row expands to show reasoning + resolved args. The active card also receives an accent border while it is executing.
- The new execution HUD (`scripts/ui/progressHud.js`) mirrors the runner (“Listening” → “Executing step” → “Plan complete/failed”) with a live step counter, active-tool pill, and progress bar tapped from the plan executor hooks.
- Message bubbles + composer now use elevated cards and tool-result chips so the assistant looks closer to the screenshot reference instead of plain blocks.
- Added an `insightsPanel` toggle (collapsed by default, state persisted via `localStorage`) so the Thinking Log/Plan/Tool Details stack stays hidden until the user clicks “Show details”; this lives in `scripts/ui/insightsPanel.js`.
- Chat input stays focusable even when the agent is executing (`scripts/app.js` keeps the textarea enabled and only disables the send button via an `isAgentBusy` guard).
- The arg resolver walks nested objects/arrays, replacing strings shaped like `$tool.alias.path` with actual values from earlier runs. Missing refs emit `[guard] missing ref …` and abort the plan.
- `turn.toolRuns[]` now captures `{ tool, save_as, argsRaw, argsResolved, startedAt, endedAt, timeMs, status, result|error }` and drives both the Tool Details drawer and any future telemetry hook-ups.
- The Thinking Log doubles as the timeline; we log `[plan]`, `[tool]`, `[log]`, `[guard]`, `[error]`, and `[decide]` markers so QA can replay every decision without devtools.
- Summary bar buttons stay synced with the collapsible panels (clicking either toggles Thinking Log + Tool Details in lockstep, with the same expanded state mirrored via `aria-expanded`).
- `scripts/tools/sandboxRunner.js` removes network/storage APIs, freezes globals, deep-clones JSON-safe objects, and only stringifies results when cloning fails so downstream `$tool.alias.result.foo` dereferences stay intact.
- Sandbox snippet cap raised to 1000 characters (was 500) so compound-interest style snippets no longer trip the guard; docs + system prompt updated accordingly.
- `math.aggregate` lives in `tools/mathAggregate.js` and is exposed via the registry so plans can run sandbox → aggregate chains (sum/avg/min/max) without writing extra JavaScript code.
- Result normalization now hoists any `result.*` fields onto the placeholder record **and** backfills a `.result` snapshot even for flat payloads, so `{{tool_result.local}}`, `{{tool_result.result.local}}`, and `$tool.schedule.result.balance` all Just Work. We still keep the original `result.*` object for backwards compatibility.
- IndexedDB-backed `memoryStore` captures the last few turns (user input, restatement, reply, tool_plan). `callGeminiApi()` injects `previous_intent`, `last_tool_plan`, and a short history string whenever available so “same but 24 months” inherits the prior parameters by default. The header exposes a “Clear Memory” button that wipes the store and logs `[log] Conversation memory cleared …`. QA recipe: run the 12‑month scenario, then ask “Same but 24 months” (should reuse data) and finally clear memory + repeat to ensure it requests clarification again.
- `repairJson()` now strips stray non-ASCII glyphs that appear outside quoted strings (e.g., the LLM inserting `をやめましょう。` between braces) before running the usual comma fixes, so malformed follow-up payloads can still be parsed instead of halting the turn.

## Progress

- Modularized the frontend into `scripts/` (app orchestrator, UI controllers, state, API, tools, utils) and updated `index.html` to load the entry module.
- Built the multi-step board UI (status chips, reason/arg blocks, skipped markers) and the new CSS tokens to keep each file under 20 KB.
- Added the named-result registry + resolver, template hydration for `{{tool.<alias>.*}}`, and a `$tool`-aware arg sanitizer so later steps can safely reuse earlier outputs.
- Instrumented timeline + summary telemetry: each step logs start/done/error (with durations, console logs, guard notes) and the summary aggregates tool counts/durations with live badges.
- Tool Details now auto-expands for the active run, rendering code/args/result/logs/errors while keeping previous runs visible.
- README/context refreshed with the new architecture, tool contract, and outstanding QA TODOs so the next engineer immediately understands the flow.
- Fixed the `replyEl` reference bug in `scripts/ui/chatView.js` so assistant replies hydrate correctly instead of throwing `ReferenceError: replyEl is not defined`.
- Resolved `resolveArgReferences` destructuring typo in `scripts/tools/planExecutor.js`, ensuring sandbox plans retain their `args.code` payload instead of tripping the `js.run_sandbox 需要 code 字串` guard.
- Added the `math.aggregate` registry entry + sanitizer so tool plans can sum/avg/min/max series (e.g., sandbox interest arrays) without more custom JS.
- Updated the sandbox runner + plan executor to keep structured results available for `$tool.alias.result.*` lookups, log `[guard] auto save_as=…` whenever aliases are inferred, and normalize tool results so top-level placeholders hydrate correctly.
- Layered in the Progress HUD + chat/composer polish (HTML/CSS/JS) so UX now shows live execution status, active tool, and a cleaner log that matches the user ask.
- Built `state/memoryStore.js`, wired `callGeminiApi()` to feed in previous intent/plan/history, and exposed a Clear Memory control so users can reset IndexedDB state on demand.
- Added the collapsible Agent Insights panel (HTML/CSS + `insightsPanel` module) so telemetry can stay hidden when the operator needs maximum chat space.
- Ensured the chat textarea no longer loses focus mid-run; only the send button is disabled while `isAgentBusy` is true.
- Patched `createNamedResultRecord()` so even tools without a native `.result` object (clock, math aggregate, etc.) still expose one, preventing `unavailable` placeholders in replies.
