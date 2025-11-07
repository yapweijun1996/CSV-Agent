# CSV Agent (Vanilla Frontend)

A pure HTML/CSS/JS front-end that talks to Gemini, enforces a JSON contract, and behaves like an iterative worker: it restates the request, shows its thinking log, drafts a tool plan, and (now) executes supported tools while keeping the UI transparent for engineers and users.

## Layout & Files

- `index.html` – Static layout for the workspace, assistant sidebar, resizer, chat area, timeline, and Next Step card plus a lightweight settings modal.
- `style.css` – Tokens + component styles (sidebar layout, resizer affordance, thinking log timeline, inline spinner, tool-result rows).
- `script.js` – All runtime logic: Gemini wiring, JSON repair, chat rendering, tool plan evaluation/execution, timeline logging, and resizer behaviors.
- `context.md` – Live notebook containing the current goal/TODO/notes/progress for the engineering session.
- `AGENTS.md` – Product rules and operating instructions the agent must follow.

## Runtime Flow (Iterative Worker)

1. **Diagnose** – `handleSend()` captures the user's question, logs it in chat, clears the thinking panel, and disables inputs so only one action runs at a time.
2. **Plan** – Gemini is prompted (see `getSystemPrompt()`) to return `restatement`, `visible_reply`, `thinking_log[]`, and a `tool_plan[]`. We parse/repair JSON strictly before touching the UI.
3. **Execute** – `renderLlmResponse()` now hands the entire `tool_plan[]` to `runToolPlan()`, which works through every step sequentially (small-step worker style):
   - Each step logs `Step i/n - …` into the thinking log so observers can trace progress.
   - `need_tool=false` steps still surface their reasoning but short‑circuit without launching code.
   - `need_tool=true` steps resolve the tool via alias mapping or keyword inference and call `executeToolWithUi()` with a spinner + status scoped to that step.
   - Unsupported plans/failed runs mark the step as failed and the plan summary card flips to “Plan finished with issues”.
4. **Log** – While a tool runs, Next Step shows `Tool: <name>` plus a micro spinner. Once finished it flips to `Executed:` or `Failed:`. Thinking log entries append `[tool]`, `[decide]`, `[warn]`, or `[error]` markers so the user sees exactly what happened. Each turn stores a `toolRuns[]` record in memory for debugging.
5. **Verify** – Chat messages append a `Result: …` line (local time or `unavailable` on failure), the timeline notes `[tool] get_current_date → …` and either `[decide] fulfilled` or `[error] get_current_date failed`, and inputs are re-enabled for the next prompt.

## Response Guardrails

- **`safeGet()` path validator** – `callGeminiApi()` now walks `candidates[0].content.parts[0].text` via a shared helper that throws `非預期回應` whenever Gemini returns a refusal/safety card without those fields. This keeps the UI from attempting to read `undefined.text` and lets the same error path surface a clear message to users.
- **JSON repair fallback** – If the returned text is malformed JSON, we slice between the first `{` and last `}` and now run light heuristics (remove dangling commas, insert missing commas for string arrays) before showing an error bubble.
- **Schema validation (`validateGeminiResponse`)** – After parsing (or repairing) the JSON, we check that every property matches the contract: `restatement`/`visible_reply` must be non-empty strings, `thinking_log` must be a string array, and `tool_plan` must contain at least one `{ need_tool, reason }` object with valid types. Violations throw `合約錯誤：…` so the UI cannot render partial/invalid data.
- **Prompt hardening** – `getSystemPrompt()` now spells out the same enforcement rules to Gemini: time/date requests require `need_tool=true` plus a supported clock tool id, `visible_reply` must not apologize about lacking real-time data, and omitting the tool id when `need_tool=true` is treated as a breach. This keeps the model aligned with the front-end contract.

## Tool Execution Details

- **Registry** – Defined in `script.js` (`TOOL_REGISTRY`). `get_current_date` returns `{ iso, local, epochMs }` with alias mapping across `get_current_date`, `clock.now`, `time.now`, and `get_time`. New in this iteration: `js.run_sandbox`, a worker-backed compute tool for tiny math/array/data snippets.
- **Sandbox tool** – The plan must provide `args: { code, args?, timeoutMs? }`. We enforce ≤500 chars of code, clamp the timeout to 50–1500 ms (default 500 ms), deep-clone any `args`, and run the snippet inside a dedicated Web Worker that deletes/blocks `fetch`, `XMLHttpRequest`, `WebSocket`, `importScripts`, `indexedDB`, `caches`, and `navigator`. Allowed globals (`Math`, `Date`, primitives, typed arrays, etc.) are frozen, console output is captured, and the worker auto-terminates on timeout. Results come back as `{ result, logs[], timeMs }` with non-primitive values JSON-stringified so the UI can drop `{{tool_result.result}}` directly into replies.
- **Intent fallback** – When Gemini sets `need_tool=true` but omits the `tool` field, we scan the plan reason + restatement + reply + original user input for Chinese/English time keywords. If matched, the agent logs `[plan] 推斷時間意圖...` and routes to `get_current_date` automatically.
- **Per-step UI states** – Every tool step renders its own `Result:` line (`Step i/n · Result: …`) under the assistant message, so multi-tool runs leave a visible breadcrumb trail. The Next Step card also includes the step prefix plus spinner/status, and the summary flips to “Plan finished with issues” whenever any step fails.
- **UI contract** – Every tool run now logs `[tool] <name> start` followed by either `[tool] <name> → …` or `[error] <name> <code>`. Sandbox runs also append `[log] [...]` when console output exists and `[guard] stringified result` whenever we had to stringify a complex return value. Success updates the chat bubble (`Result: …`, placeholders hydrated), updates the Next Step card to `Executed: <name>`, and records `[decide] fulfilled`. Failures flip the card to `Failed`, mark the timeline with `[error] ...`, and show `Result: unavailable`.
- **Unsupported tools** – Any non-whitelisted tool names emit `[warn] unsupported tool: <name>` in the timeline and keep the session stable so engineers can diagnose prompt issues without a crash.

## UI / UX Notes

- **Assistant resizer** – Accessible drag/keyboard resizing between main content and assistant sidebar with live logging (`[layout] ...`). Width is clamped between 280–640px.
- **Timeline = Thinking Log** – The `<ul>` in the sidebar doubles as a chronological trace of LLM reasoning plus system/tool events, so observers can audit decisions without checking devtools. The log header now has a Hide/Show toggle so users can collapse the trace when they only care about the final answer.
- **Next Step card** – Shows the current `tool_plan` summary, spinner while executing, and final status (“Executed” / “Failed” / “Unsupported” / “No tool needed”). This mirrors the update_plan approach described in `context.md`.
- **Tool Details drawer** – Each tool execution populates a collapsible panel with its metadata. For `js.run_sandbox` runs we render the exact code, args payload, timeout, logs, result, and guard notes so users can inspect what ran without opening DevTools.
- **Settings modal** – Stores the Gemini API key + model in `localStorage`; no backend is required.

## Extending the Agent

- Add more tools by extending `TOOL_REGISTRY` (each entry exposes `run()` and can log additional metadata into `toolRuns`). Update the alias map and keyword heuristic as needed.
- Inject richer timeline styling or card components purely via `style.css`; avoid frameworks per project rules.
- Keep `context.md` + this README updated whenever the workflow changes so the next engineer can reason about multi-step execution without spelunking through the entire script.

The project deliberately stays framework-free; every iteration should respect the small-step, log-everything mentality so both engineers and users can trust what the agent is doing.
