# CSV Agent (Vanilla Frontend)

A single-page HTML/CSS/JS experience that behaves like an iterative worker for CSV analysis. The UI stays lightweight (no frameworks) while surfacing the agent's thinking, logs, and plan so engineers can debug or extend it quickly.

## Layout & Files

- `index.html` – Contains the markup, scoped styles, and vanilla JS logic (CSV parsing, agent planner, assistant timeline, resizing).
- `context.md` – Live scratchpad for goals/TODO/notes/progress during ongoing work.
- `AGENTS.md` – Product requirements and operating rules for this project.

## Agent Workflow

1. **Plan bootstrap** – When a CSV is provided (upload or drag/drop), `bootstrapPlan()` seeds four default steps (`Validate file`, `Parse rows & headers`, `Profile dataset`, `Await user instruction`). The assistant panel and status card both mirror this plan.
2. **Step execution** – Each stage calls `setActiveStep()` before running and `completeStep()` afterward. Notes (e.g., detected delimiter, row counts) are written to each task so the UI reads like an audit log.
3. **Logging** – `addLog()` pushes bilingual-friendly updates into the timeline with icons for info/success/warning/error/thinking, ensuring users always see what the agent is doing.
4. **Data rendering** – After parsing, `renderPreview()` paints the first 50 rows, while `renderDataSummary()` updates file stats, delimiter info, and column samples. This keeps the explorer synchronized with the plan.
5. **Hand-off** – Final step stays active (`Await user instruction`) so the assistant clearly shows it's ready for the next transformation request.

## UI Details

- **Unified chrome** – Sticky header with quick `New Session` / `History` / `Settings` / `Upload CSV` controls, shared spacing scale, and rounded panels for both workspace and assistant cards.
- **Persistent resizer** – The divider between content and assistant now includes a always-visible line so the drag target never disappears.
- **Dropzone workflow** – The empty state is a dashed drop area that mirrors the reference mock; dragging a file highlights it and you can still click anywhere to open the hidden input.
- **Assistant panel** – Adds a task summary (headline, chip, progress bar) plus a scrollable checklist that mirrors the agent’s plan. Logs appear underneath, with quick history/settings/toggle icons.
- **Loader & drag/drop** – Full-screen loader blocks interactions during parsing, while body-level drag states instruct users to drop files anywhere.

## Extending the Agent

- **Custom steps** – Update `bootstrapPlan()` to push more granular tasks if you add data profiling, charting, or LLM calls. Every step only needs a label; the UI handles the rest.
- **Extra logging** – Call `addLog('message', 'info' | 'success' | 'warning' | 'error' | 'thinking' | 'plan')` to broadcast internal decisions or tool failures.
- **Data actions** – Append new utilities near the parsing helpers in `index.html`, then trigger them after step 2 or 3 depending on whether they rely on headers or derived stats.

Keep edits focused on `index.html` (vanilla stack only), follow the multi-step plan guidelines, and keep README/context up to date so the next engineer can jump in with minimal ramp-up.
