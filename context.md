# CSV Agent - Gemini Integration

## Goal

Wire the chat input to a real Gemini API call, force a structured JSON response, and render the fields into the Chat, Timeline, and Next Step UI components.

## TODO

- [ ] **Diagnose & Plan:** Analyze existing HTML/CSS/JS and create a detailed implementation plan.
- [ ] **Implement Gemini API Call:** Modify `script.js` to send user messages to the Gemini API.
- [ ] **Enforce JSON Contract:** Add logic to instruct Gemini to return JSON and handle potential non-JSON responses.
- [ ] **Render UI Components:** Implement rendering for Chat, Timeline, and Next Step areas from the parsed JSON.
- [ ] **Test & Verify:** Test with specified user inputs and error conditions.

## Notes

- The agent must strictly adhere to the JSON contract provided.
- Error handling for non-JSON responses is critical.
- The `tool_plan` is for display only; no tools will be executed.

---

## Current Goal (Resizer Diagnosis)

Keep the vanilla CSV Agent UI compliant with the iterative worker workflow while ensuring the assistant/content splitter (`.resizer`) behaves as expected.

### TODO
- [x] Inspect the current HTML/CSS/JS to confirm whether the `.resizer` divider and drag handling exist.
- [x] Plan the required markup/CSS/JS updates so the resizer can be implemented without violating the no-framework constraint.
- [x] Implement the resizer (markup hook, CSS sizing via variables, JS drag logic, logging).

### Notes
- No `<div class="resizer" id="resizer">` exists in `index.html`, and there is no related styling or pointer event handling in `style.css` / `script.js`.
- Without DOM + event bindings, the drag logic cannot run, so the resizer appears "broken" even though nothing is hooked up yet.

### Progress
- Verified the resizer element/logic is missing entirely, explaining why the divider is non-functional.
- Added CSS custom properties + an accessible separator element, then wired pointer/keyboard drag logic (with thinking logs) so the assistant width can be adjusted live.
