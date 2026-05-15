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
5. F5 to launch extension

## Expected Behavior

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
