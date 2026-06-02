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
- [ ] Step 4: prompt LLM properly 
   - provide context 
   - have it output the planned breakpoints and watches (in a log at first)
- [ ] Stage 5: launch a debugging environment 
- [ ] Stage 6: apply the LLM inferred breakpoints 
- [ ] Step 7: tie to commands 
- [ ] Step 8: clean up documentation 

## Improvement Notes: 
- the Webview box is kind of ugly now, work on UI more 


## Audience and Testing: 
Audience: novice to intermediate developers who can see the bug but are having a hard time translating it to the location in the code.

Testing: single file data structure and algorithm manipulations (like Trees, Graphs, BST< Hoffman encoding, etc). For now, in Python.

