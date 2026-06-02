# LLM Powered Debugger

Extension implementation of projection boxes, kind of. Calling on an LLM to display relevant variable and function information.

## Purpose of tool: 
- aid developer understanding of code by proxy of debugging 
- allow developer to set up debugging enviornment correctly
- addresses issues of novice developers having trouble using the debugger and translating their hypothesis of a bug into debugger settings 

## Vision: 
- developer gives natural language specification of where or what the logic bug is in the code 
- the tool, using an LLM, can "drop" developer into a point of interest
   - the tool achieves the above by setting up breakpoints, setting up conditional breakpoints, specifying watch expressions and other basic debugger set up 
- the tool attaches to an existing IDE debugger, does not host its own 
- the debugger is still able to be manipulated and adjusted by the developer and maintains more advanced debugger features 
   - the developer should be able to add additional breakpoints/expressions at their convenience
- possibly: the developer is able to prompt additional queries to the LLM to tweak debugger functionality 
- possibly: the LLM displays relevant/interesting intermediate values at other breakpoints in-line in the margins so the developer can get a glanceable view and understanding of the interesting state 
- POC: keep python only for now, maybe with a possibility of making this language agnostic later 


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

