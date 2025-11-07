# CSV Agent - Tool Execution Upgrade

## Goal

Convert the previously decorative `tool_plan` into an actual multi-step workflow: when Gemini decides a supported tool is needed (e.g., current date/time), the frontend executes it, writes the result back into chat, timeline, and the Next Step card, and keeps everything observable for engineers.

## TODO

- [x] Audit the existing chat/thinking/plan rendering to understand current state handling.
- [x] Implement `get_current_date` tool execution (alias mapping, thinking log updates, spinner UI, chat result lines).
- [x] Document the architecture + flow inside `README.md`.
- [x] Guard the Gemini response path with `safeGet()` so safety or refusal payloads surface「非預期回應」instead of crashing.
- [ ] Run through the full acceptance tests (`today date` twice, “what time is it now?”, unsupported tool) to verify no turn leakage.
- [x] Fix LLM prompt/contract so Gemini stops replying “I cannot provide real-time data” after we return a tool result; visible replies should reference the tool output.
- [x] Harden the system prompt again so time/date requests MUST return a tool plan and can’t respond with “no real-time data”.
- [x] Add `validateGeminiResponse()` schema enforcement (#5) so malformed responses fail fast on the frontend.
- [x] Add `js.run_sandbox` worker sandbox (code≤500 chars, timeout guard, denied APIs) plus UI hydration/logging.
- [ ] Run sandbox acceptance matrix (math, args injection, console log capture, forbidden API, timeout, object result) once UI is wired.

## Notes

- Tool aliases: `get_current_date`, `clock.now`, `time.now`, `get_time`. Missing tool names fall back via keyword intent detection across the plan reason, restatement, reply, and original user input.
- Thinking log doubles as the timeline. We append `[tool] …`, `[decide] fulfilled`, `[warn] …`, `[error] …` events so users can follow each step.
- Next Step card now has spinner state (“Tool: …”), success (“Executed: …”), failure (“Failed: …”), and unsupported tool messaging.
- Each chat turn stores a `toolRuns[]` array in memory for potential debugging/telemetry later.
- `safeGet()` (in `script.js`) replaces direct `candidates[0].content.parts[0].text` access; any missing leg logs to console and throws an error bubble so JSON repair / UI handling stays consistent.
- `validateGeminiResponse()` rejects any payload missing string fields, string thinking logs, or at least one valid `{ need_tool, reason }` entry before rendering.
- Prompt text now threatens contract failure if Gemini tries to dodge real-time requests or forgets to name an allowed tool id when `need_tool=true`.
- `js.run_sandbox` sanitizes plan args, deep clones data, spawns a dedicated worker with fetch/XMLHttpRequest/WebSocket/importScripts/indexedDB/caches removed, disables `navigator`, freezes allowed globals, captures console output, and enforces termination on timeout so snippets stay compute-only.
- Timeline now emits `[tool] <name> start`, `[tool] <name> → …`, `[log] …` (when console output exists), `[guard] stringified result` for non-primitive returns, and `[error] <name> <code>` when the sandbox blocks a call or hits timeout.
- Fixed the system prompt literal so inline instructions use quotes instead of backticks ("return")—prevents `SyntaxError: unexpected token: keyword 'return'` at load time.
- Thinking log UI gained a hide/show toggle, and a new Tool Details drawer surfaces the exact sandbox code, args, logs, and results (with guard notes) so users can audit executions without digging into DevTools.
- JSON repair now chains extra heuristics (remove trailing commas, auto-insert missing commas between adjacent string literals) so LLM typos like missing `,` inside `thinking_log` arrays no longer crash the turn.

## Progress

- UI changes (spinner markup, `tool-result` rows) plus the JS execution path are live.
- Prompt now states tools WILL run, forbids “no real-time data” apologies, and tells Gemini to place placeholders such as {{tool_result.local}} / {{tool_result.iso}} inside `visible_reply` when a tool outcome is expected.
- Added schema validation plus stricter prompt rules to keep time/date questions flowing through the actual tool with no “I can’t” replies.
- Added placeholder hydration: once a tool succeeds (or fails), we replace `{{tool_result.*}}` tokens inside `visible_reply` with the actual result or `unavailable`, keeping the chat bubble consistent with the Result line.
- Added robust response parsing guardrails so safety/blocked replies raise “非預期回應” instead of throwing `Cannot read properties of undefined`.
- Integrated `js.run_sandbox` end-to-end (prompt contract, argument validation, worker sandbox, timeout, log capture, UI timeline, README updates) so compute snippets can run safely inside the browser.
- Added collapsible controls for the thinking log and a tool details panel that renders sandbox code payloads, execution metadata, and guard notes for each run.
