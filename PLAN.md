# LLM Debugger POC — Implementation Plan

## POC Scope: 
Must haves: 
- NL specification scope 
- LLM sets: line/conditional/hit-count breakpoints, watch expressions, logpoints (maybe?)
- Python only

Later extensions: 
- Preview and accept plan before it is applied 
- Clear assistant 
- In line snapshot of the variables for glaceable understanding 
- Back and forth interaction with the LLM to add more points/change them 
- Configurable settings to the user (allow to specify more points manually, etc)

## Steps: 
- [x] Step 1: remove all the old code 
- [x] Step 2: create InputBox for NL spec 
   - create a prompt box in the extension window
   - save the input from the prompt box 
- [x] Step 3: gather context for LLM to use 
   - InputBox with NL spec 
   - the file itself 
   - line numbers 
   - AST-derived capture sites (hints for LLM; LLM still chooses breakpoints)
- [x] Step 4: prompt LLM properly 
   - provide context 
   - have it output the planned breakpoints and watches (in a log at first)
- [ ] Stage 5: launch debugger 
   - start the environment successfully 
   - apply LLM inference successfully 
- [ ] Step 6: tie to commands 
- [ ] Step 7: clean up documentation 
- [ ] Step 8: clean up UI 
   - the webview is ugly 


## Improvement Notes: 
- the Webview box is kind of ugly now, work on UI more 
- the LLM output makes sense, need to dig into it a little bit more and possibly tweak it a bit 


## Audience and Testing: 
Audience: novice to intermediate developers who can see the bug but are having a hard time translating it to the location in the code.

Testing: single file data structure and algorithm manipulations (like Trees, Graphs, BST< Hoffman encoding, etc). For now, in Python.

