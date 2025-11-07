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

## Notes

- Tool aliases: `get_current_date`, `clock.now`, `time.now`, `get_time`. Missing tool names fall back via keyword intent detection across the plan reason, restatement, reply, and original user input.
- Thinking log doubles as the timeline. We append `[tool] …`, `[decide] fulfilled`, `[warn] …`, `[error] …` events so users can follow each step.
- Next Step card now has spinner state (“Tool: …”), success (“Executed: …”), failure (“Failed: …”), and unsupported tool messaging.
- Each chat turn stores a `toolRuns[]` array in memory for potential debugging/telemetry later.
- `safeGet()` (in `script.js`) replaces direct `candidates[0].content.parts[0].text` access; any missing leg logs to console and throws an error bubble so JSON repair / UI handling stays consistent.

## Progress

- UI changes (spinner markup, `tool-result` rows) plus the JS execution path are live.
- Prompt now states tools WILL run, forbids “no real-time data” apologies, and tells Gemini to place placeholders such as {{tool_result.local}} / {{tool_result.iso}} inside `visible_reply` when a tool outcome is expected.
- Added placeholder hydration: once a tool succeeds (or fails), we replace `{{tool_result.*}}` tokens inside `visible_reply` with the actual result or `unavailable`, keeping the chat bubble consistent with the Result line.
- Added robust response parsing guardrails so safety/blocked replies raise “非預期回應” instead of throwing `Cannot read properties of undefined`.
