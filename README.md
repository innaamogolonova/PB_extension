# PB(ish) Extension

Extension implementation of projection boxes, kind of. Calling on an LLM to display relevant variable and function information.

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

3. `npm install` from root
4. `npm run compile` from root
5. F5 to launch extension

## Expected Behavior

- File should execute (assuming that file is correct and executable)
- Console logs should be descriptive and visible in the Debug Console
- Intermediate values printed in the Debug Console
