# PB(ish) Extension

Extension implementation of projection boxes, kind of. Calling on an LLM to display relevant variable and function information.

## Purpose 

Help programmers understand code by showing runtime values at meaningful places, with LLM-chosen relevance, in the editor — inspired by projection boxes / live programming.

## Requirements

- VS Code version ^1.108.1
- node v20
- OpenAI API Key

## Installation and Running Instructions

1. clone repository
2. set API via VS Code settings JSON

- open command palette: mac `Ctrl+Shift+P`
- type and select "Preferences: Open User Settings (JSON)"
- add this line anywhere in settings.json (before the closing }): \
   `"pbExtension.openaiApiKey": "your-api-key-here"`
- replace `your-api-key` with your actual key
- add this line too:
  `"pbExtension.llmFilteringEnabled": true`
- save the file

3. `npm install` from root (vulnerabilities might show up, ignore warnings for now)
4. `npm run compile` from root
5. F5 to launch extension (main window — launches **Extension Development Host**)

### Attach tracing (Phases 1–3)

Work in the **Extension Development Host** window (not the main repo window).

1. Install **Python** and **Python Debugger** extensions in that window if prompted.
2. Open `tests/web_app/services.py` (has heuristic `return` / call lines).
3. Command Palette → **PB Extension: Run PB**.
4. View logs: **Output** panel → **PB Extension**.

### Reading trace UI (after a run)

| UI | What it shows |
|----|----------------|
| **Ghost text** `⟨PB⟩ name=value…` at end of line | LLM-filtered snapshot (falls back to raw vars if LLM returns nothing) |
| **CodeLens** above captured lines | `PB: … — click for full trace` → table + quick pick |
| **Hover** (when not debugging) | Markdown table of all captured variables |
| **While paused on a breakpoint** | Debugger hover shows Python internals — use **CodeLens** for PB trace instead |

Enable **CodeLens** in the editor if you do not see links above lines: Command Palette → "Preferences: Open Settings" → search `code lens` → ensure Code Lens is on.

## Expected Behavior (old) 

Pre-req: make sure that the test file is executable and correct

1. In the popped up extension window open the test directory and one of the test Python files.
2. Open the command palette and run "Test Debug Executor" command

Expected:

- The file will execute with the debugger running
- You will see per line traces as the debugger steps through the file
- Result of executable file should show up on the terminal
- After execution, there will be a slight delay of values displays
- LLM filtered output will be an in-line ghost text decoration (git blame style)
- Hovering over the line will show the full trace using codelens
