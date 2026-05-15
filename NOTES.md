# Project Notes 

## Expected User Experience 
- developer launches extension 
- within the extension, user runs their app (using a python, node, etc command)
- the traces display when the app is done running 
- the developer looks at the code and sees relevant intermediate trace variables in the margins (ghost text) 
- if needed, the ghost text can be configured (turned on/off, show other values, etc)
- the developer is also able to see the full trace for a certain line if needed (either on hover or key bound)
- the values update as the user makes changes to the code 
- the relevant values are seamlessly incorporated in the workflow, helping the user see useful information instanteneously without being overwhelmed

## Areas of Application 

**Backend Comprehension: Web Apps + API Interactions**
Optimize for: 
1. Boundary values — what crossed a layer
   - e.g. payload["product_id"] → quote_request.product_id → product from catalog
2. Decision drivers — what chose the branch
   - e.g. discount_rate, product is None, tax_rate for country
3. Computed deltas — what changed meaning
   - e.g. subtotal, discount_amount, final_total (not all at once—pick the one on this line)
4. Contract hints — what the client will see
   - e.g. quote_result["total"], receipt["order_ref"] at return jsonify(...)
5. Failure semantics — when things go wrong
   - missing keys, None after .get(), raised ValueError inputs

Avoid (unless the line is about them): 
Werkzeug internals, full JSON strings, timestamps/seeds for order refs, random outputs.

**Other Domains:**
Stick to domains with non-obvious intermediate state and multi-step logic:

1. CLI / batch scripts — argparse → load config → transform → write output (deterministic, easy to replay).
2. ETL / data cleaning — row counts, null rates, key normalization before join (classic “what did this line think the data was?”).
3. Async / concurrent clients — your aggregator pattern; comprehension task: “which API failed silently in _enrich_profile?”
4. ML training loops — loss, batch size, mask sums at if/return (high signal; watch for huge tensors—LLM should project scalars/summaries only).
5. Rule engines / pricing / auth — business rules with branches (same shape as OrderService).
6. ORM-heavy services — “why was this row excluded?” (filter dicts, query flags)—if you add DB fixtures.

## Principles and Requirements: 

### Must Have
- configurable -> able to toggle on/off 
- ability to see full trace for a captured line 
- see current state (stale trace or updated)
- anchored only to relevant line -> developer able to see the relevant values right away 
- live updates to trace display on changes to file -> live programming principle !
- moving between files automatically updates the dispaly of variables 
- fast 
- remove the "one file run" limitation -> collect trace just with the natural deployment of the app 
- glanceable projections -> keep projections short and sweet 

### Later Improvements 
- more debugger features (expressions with runtime values, adding breakpoints, adding statements live, etc.)
- key bind commands to have a better workflow 
- language agnostic 
- some kind of developer control -> setting relevant values for the LLM to always display, manually adding otehr breakpoints, etc. 
- LLM first pass to detect critical lines 

### Nice to Have 
- hypothesis -> developer is able to rpovide some hypothesis/guide for LLM to judge relevance 
- optional exhaustive stepping mode (collecting trace for every line -> expensive and inefficient)

## Clarifications 
- currently only for Python
- ghost text: LLM inference; line hover: full trace  

## May 15, 2026: Pivot Session 

Two ways to move on with this project: 
- Attach to a VSCode Debug Session + Capture at Critical Breakpoints (next steps)
- Non-DAP approach (reach, implement later if needed)

## Attach + Capture at Breakpoints

**Idea:** Listen to a normal VS Code debug session (e.g. user **F5** / `launch.json`) instead of driving a `stepIn` loop. Record snapshots **only at heuristic sites** (today: something like `CriticalPointDetector`; later: LLM-chosen lines). **Full trace** here = **full locals per captured line**; lines we never mark stay empty on purpose.

**Attach (high level)**

| Step | Behavior |
| --- | --- |
| 1 | Debug session starts; extension ties `DebugValueTracker` (or equivalent) to **that** session. |
| 2 | Extension sets **automatic** breakpoints on heuristic lines (by file/URI), not “learn the Breakpoints view.” |
| 3 | On each **stopped** event: read stack/locals → `TraceManager.appendState` → **`continue`**. No default stepping. |

**Pipeline**

```text
run / continue → hit heuristic BP → capture full locals → appendState → continue → … → end run
                                                                        ↓
                                              LLM → inline ghost text; hover → full snapshot at that line
```

**Display**

- **Inline:** `LLMFilterService` trims to a short hint at lines we captured.  
- **Hover:** full variable list from the store (same as “full trace for this line” today).  
- **Coverage:** only **specified** locations—not every executed line—so we skip heavy stepping.

**Stepping:** optional **exhaustive** mode for tiny scripts; default path stays **breakpoint + continue** only.

## Non-DAP

| Approach | Tradeoff |
| --- | --- |
| Python `sys.settrace` / profile hooks at function entry | Fast, but custom runtime; not full debugger fidelity |
| Node inspector / OpenTelemetry / `diagnostics_channel` | Great for npm services; more engineering |
| Compile-time / AST injection (`console.log` / record wrappers) | Predictable, works without debugger |

These align with live programming research when you care about “values at projections” more than “exact debugger semantics.”


**Visual: two backends, one product**
```
                    ┌─────────────────┐
  DAP attach/BP  ──►│                 │
                    │  TraceManager   │──► LLMFilterService ──► inline + hover
  pb_runner hook ──►│  (full locals   │
                    │   per site)     │
                    └─────────────────┘
```

**What it does not mean**

- Replacing the LLM with smarter logging.
- Replacing projection boxes with print debugging.
- Abandoning “full” snapshots at each site (you can still store complete locals at each hook).


**Honest limitation**

Non-DAP is more engineering (serialization, `locals()` copies, threads, C extensions) and weaker for weird debugger-only values. For a research prototype, DAP-first with a clean capture interface is still sane; non-DAP is an optimization/alternate path once the product story is clear.


## Next Steps 
**Step 1 — Clarify the contract (on paper, then in code)**
Write down explicitly:

- Capture sites: lines where snapshots exist (heuristic → later LLM).
- Snapshot content: all filtered locals at that site (what tracker already does).
- Inline display: LLM subset.
- Hover: full snapshot (already true).

That makes “full trace” defensible without stepping every line.

**Step 2 — DAP: attach + automatic breakpoints (not manual)**
- User runs Python normally (F5) or one “PB run” command.
- Extension sets breakpoints from CriticalPointDetector (later: LLM line picker).
- On stop: capture full locals → appendState.
- No stepIn loop in default mode.
- Optional command: “Exhaustive trace (small files only)” keeps current stepping for research comparisons.

This preserves LLM and full locals; fixes speed and launch workflow.

**Step 3 — Strengthen what makes it not a debugger**
- Default: no stepping UI in your commands.
- Show inline projections immediately (incremental apply); LLM async per line or batched.
- Staleness + refresh (your Phase 3) — debugger doesn’t do “code changed, projections outdated.”
- Roadmap: LLM chooses capture lines — that’s your differentiator vs regex breakpoints and vs raw debugger.

**Step 4 — Non-DAP only as a parallel experiment**
After Step 2 works on tests/test.py and tests/web_app:

- Tiny pb_runner that writes the same JSON shape as traceToJSON.
- Extension command: “Load trace from run” — proves the UI/LLM path is backend-agnostic.
- Compare speed/quality; don’t commit to non-DAP until DAP attach path feels right.

**Defer**
- Node/npm attach.
- Custom debug adapter.
- Exhaustive trace as default.