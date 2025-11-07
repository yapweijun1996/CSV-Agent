# CSV Agent – Multi-Step Tool Runner Upgrade

## Goal

Deliver a Vanilla JS front-end that acts like a transparent, iterative worker: the agent must execute every `tool_plan` step sequentially, support `save_as` aliases + `$tool.*` references, hydrate named placeholders in the visible reply, and surface a detailed audit trail (thinking log, plan board, tool details, summary bar) while keeping the codebase modular (`type="module"`, single-responsibility files ≤300 lines).

## TODO

- [x] Split the legacy 1.8k-line script into ES modules (`scripts/` tree) covering API, state, UI, tooling, and utilities.
- [x] Replace the Next Step text block with a multi-step board showing Planned → Executing → Executed/Failed/Skipped (with badges + auto-expansion).
- [x] Implement the save-as registry, `$tool.<alias>.<path>` resolver, sequential runner, and halt-on-failure guardrails.
- [x] Hydrate replies with both `{{tool_result.*}}` (last result) and `{{tool.<alias>.*}}`, plus fallback `unavailable`.
- [x] Update README + context to document the new architecture/contract so future engineers can maintain it cheaply.
- [ ] Manual QA: run the savings-projection scenario (clock + sandbox + aggregate), zero-deposit case, and forced failure (bad code / timeout) once time permits.
- [ ] Visual polish backlog: micro-transitions on plan badges + detail drawer, dark-mode tokens.

## Notes

- Each plan step is assigned `save_as` (auto `_stepN` if missing) and rendered in `tool_plan_list`; badges change color as states evolve and the active row expands to show reasoning + resolved args.
- The arg resolver walks nested objects/arrays, replacing strings shaped like `$tool.alias.path` with actual values from earlier runs. Missing refs emit `[guard] missing ref …` and abort the plan.
- `turn.toolRuns[]` now captures `{ tool, saveAs, argsRaw, argsResolved, startedAt, endedAt, timeMs, status, result|error }` and drives both the Tool Details drawer and any future telemetry hook-ups.
- The Thinking Log doubles as the timeline; we log `[plan]`, `[tool]`, `[log]`, `[guard]`, `[error]`, and `[decide]` markers so QA can replay every decision without devtools.
- Summary bar buttons stay synced with the collapsible panels (clicking either toggles Thinking Log + Tool Details in lockstep, with the same expanded state mirrored via `aria-expanded`).
- `scripts/tools/sandboxRunner.js` removes network/storage APIs, freezes globals, and stringifies non-primitives so sandbox results can safely flow through placeholders/UI.
- Sandbox snippet cap raised to 1000 characters (was 500) so compound-interest style snippets no longer trip the guard; docs + system prompt updated accordingly.

## Progress

- Modularized the frontend into `scripts/` (app orchestrator, UI controllers, state, API, tools, utils) and updated `index.html` to load the entry module.
- Built the multi-step board UI (status chips, reason/arg blocks, skipped markers) and the new CSS tokens to keep each file under 20 KB.
- Added the named-result registry + resolver, template hydration for `{{tool.<alias>.*}}`, and a `$tool`-aware arg sanitizer so later steps can safely reuse earlier outputs.
- Instrumented timeline + summary telemetry: each step logs start/done/error (with durations, console logs, guard notes) and the summary aggregates tool counts/durations with live badges.
- Tool Details now auto-expands for the active run, rendering code/args/result/logs/errors while keeping previous runs visible.
- README/context refreshed with the new architecture, tool contract, and outstanding QA TODOs so the next engineer immediately understands the flow.
- Fixed the `replyEl` reference bug in `scripts/ui/chatView.js` so assistant replies hydrate correctly instead of throwing `ReferenceError: replyEl is not defined`.
- Resolved `resolveArgReferences` destructuring typo in `scripts/tools/planExecutor.js`, ensuring sandbox plans retain their `args.code` payload instead of tripping the `js.run_sandbox 需要 code 字串` guard.
