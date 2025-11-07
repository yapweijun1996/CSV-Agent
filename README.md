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
3. **Execute** – `renderLlmResponse()` paints the chat + thinking log, inspects the first `tool_plan` entry, and decides what to do next:
   - If `need_tool=false`, the Next Step card simply explains why no action is required.
   - If `need_tool=true`, we resolve the tool via alias mapping or intent inference (date/time keywords across the plan, restatement, reply, and user input) and run it.
4. **Log** – While a tool runs, Next Step shows `Tool: <name>` plus a micro spinner. Once finished it flips to `Executed:` or `Failed:`. Thinking log entries append `[tool]`, `[decide]`, `[warn]`, or `[error]` markers so the user sees exactly what happened. Each turn stores a `toolRuns[]` record in memory for debugging.
5. **Verify** – Chat messages append a `Result: …` line (local time or `unavailable` on failure), the timeline notes `[tool] get_current_date → …` and either `[decide] fulfilled` or `[error] get_current_date failed`, and inputs are re-enabled for the next prompt.

## Tool Execution Details

- **Registry** – Defined in `script.js` (`TOOL_REGISTRY`). Only `get_current_date` exists today, returning `{ iso, local, epochMs }`. Alias mapping supports `get_current_date`, `clock.now`, `time.now`, and `get_time`.
- **Intent fallback** – When Gemini sets `need_tool=true` but omits the `tool` field, we scan the plan reason + restatement + reply + original user input for Chinese/English time keywords. If matched, the agent logs `[plan] 推斷時間意圖...` and routes to `get_current_date` automatically.
- **UI contract** – Success adds `Result: <local>` under the assistant reply, inserts `[tool] …` + `[decide] fulfilled` into the timeline, and changes Next Step to “Executed: get_current_date”. Failures surface `[error] … failed`, show `Result: unavailable`, and leave the UI ready for another attempt.
- **Unsupported tools** – Any non-whitelisted tool names emit `[warn] unsupported tool: <name>` in the timeline and keep the session stable so engineers can diagnose prompt issues without a crash.

## UI / UX Notes

- **Assistant resizer** – Accessible drag/keyboard resizing between main content and assistant sidebar with live logging (`[layout] ...`). Width is clamped between 280–640px.
- **Timeline = Thinking Log** – The `<ul>` in the sidebar doubles as a chronological trace of LLM reasoning plus system/tool events, so observers can audit decisions without checking devtools.
- **Next Step card** – Shows the current `tool_plan` summary, spinner while executing, and final status (“Executed” / “Failed” / “Unsupported” / “No tool needed”). This mirrors the update_plan approach described in `context.md`.
- **Settings modal** – Stores the Gemini API key + model in `localStorage`; no backend is required.

## Extending the Agent

- Add more tools by extending `TOOL_REGISTRY` (each entry exposes `run()` and can log additional metadata into `toolRuns`). Update the alias map and keyword heuristic as needed.
- Inject richer timeline styling or card components purely via `style.css`; avoid frameworks per project rules.
- Keep `context.md` + this README updated whenever the workflow changes so the next engineer can reason about multi-step execution without spelunking through the entire script.

The project deliberately stays framework-free; every iteration should respect the small-step, log-everything mentality so both engineers and users can trust what the agent is doing.
