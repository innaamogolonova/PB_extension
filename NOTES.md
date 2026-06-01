# Project Notes 

## Current State (High-Level Overview)

Snapshot of **what is implemented today** (Python-only, DAP-first). 

### Product in one sentence

VS Code extension that attaches to Python debug sessions, captures **full locals** at AST-chosen lines, stores them in `TraceManager`, and shows **LLM-filtered ghost text** plus **full trace** on hover / CodeLens.

### What works today

| Area | Status |
| --- | --- |
| **Default capture** | `breakpoint-continue` — auto breakpoints at capture sites, capture on pause, auto-continue |
| **Attach tracing** | `SessionOrchestrator` observes user F5 / launch.json sessions when tracing is on |
| **Run PB** | Pre-launch breakpoints + `debugpy` session from active `.py` editor |
| **Capture sites** | AST detector (`scripts/detect_capture_sites.py`) with regex fallback; kinds: return, assign, if, elif, raise, loop (capped) |
| **Trace store** | `TraceManager` — multi-session, multi-file, path normalization, pin best session per file |
| **Display** | Ghost text (`AnnotationsProvider`), hover (`FullTraceHoverProvider`), CodeLens + `showLineTrace` |
| **LLM** | `LLMFilterService` (OpenAI `gpt-4o-mini`) — optional via settings |
| **Exhaustive mode** | `runPbExhaustive` / `DebugExecutor` stepping loop — research / small files only |
| **Test app** | `tests/web_app` — multi-file Flask app for boundary/decision trace exercises |

### Architecture (as built)

```text
Commands (extension.ts, runPb.ts)
        │
        ├─► SessionOrchestrator (observed) ──► BreakpointPlanner ──► AST / regex sites
        │         └─► BreakpointCaptureEngine ──► DebugValueTracker ──► TraceManager
        │
        └─► DebugExecutor (owned exhaustive / optional owned BP path)
                  └─► BreakpointTracingRun or stepIn loop ──► TraceManager
        │
        ▼
Display: refreshTraceDisplay → AnnotationsProvider + LLMFilterService + Hover + CodeLens
```

**Layers (matches plan):** M1 orchestration · M2/M2a breakpoints + AST · M3 capture engine · M4 `TraceManager` · M5 presentation.

### Default user flow

1. Open repo in **Extension Development Host** (F5 from extension workspace).
2. Open a Python file (e.g. `tests/web_app/services.py`).
3. **PB Extension: Run PB** (or enable **Start Tracing**, then F5 with **Python: Current File**).
4. Debugger hits PB breakpoints → locals captured → session continues automatically.
5. When the debug session ends: ghost text and CodeLens update; hover shows full locals per line.
6. Diagnostics: **Output → PB Extension**.

### Session modes

| Mode | Who starts debug | Handler |
| --- | --- | --- |
| **Observed** | User / Run PB via orchestrator | `SessionOrchestrator` + `BreakpointCaptureEngine` |
| **Owned** | `DebugExecutor` (exhaustive command) | Stepping loop; orchestrator skips attach |

Capture engine uses a **250ms poller** plus DAP tracker fallbacks because `stopped` events are unreliable in some hosts.

### Settings that matter

- `pbExtension.captureMode` — `breakpoint-continue` (default) vs `exhaustive-step`
- `pbExtension.captureSiteDetector` — `ast-with-regex-fallback` (default)
- `pbExtension.autoContinue`, `pbExtension.llmFilteringEnabled`, `pbExtension.openaiApiKey`
- `pbExtension.maxLoopCaptureSitesPerFile`, `pbExtension.pythonInterpreter`

### Not done yet (vision vs code)

- **Live refresh on edit** — `markFileStale` exists; stale UI / re-run flow incomplete
- **LLM-chosen capture lines** — still AST/heuristic only
- **Natural app deploy** — multi-file works for open workspace editors + entrypoint; not full “run server however you want” without debug
- **Non-DAP backend** — documented only; no `pb_runner` / load-trace command
- **Node / other languages** — Python only
- **Less debugger feel** — PB breakpoints still appear in Breakpoints view; UX polish pending
- **Stale commands in package.json** — e.g. `executeFile` not wired in `extension.ts`

### Key entrypoints (code)

| Concern | File |
| --- | --- |
| Activation / commands | `src/extension.ts` |
| Run PB | `src/commands/runPb.ts`, `src/orchestration/SessionOrchestrator.ts` |
| Where to break | `src/orchestration/BreakpointPlanner.ts`, `src/analysis/AstCaptureSiteProvider.ts` |
| Capture on pause | `src/orchestration/BreakpointCaptureEngine.ts`, `src/tracking/DebugValueTracker.ts` |
| Store | `src/tracking/TraceManager.ts` |
| Inline + full UI | `src/display/AnnotationsProvider.ts`, `LLMFilterService.ts` |

---

## Contract

Shared vocabulary for design, code, and docs. “Full trace” means **full locals at captured lines only** — not every executed line.

### Terms

| Term | Meaning |
| --- | --- |
| **Attach mode** | Extension listens to an **existing** VS Code debug session (F5 / `launch.json` / Run PB); default capture does **not** use a `stepIn` loop. |
| **Capture site** | A source line where PB sets a breakpoint and may record a snapshot. Chosen by AST (+ regex fallback) today; LLM line picker later. |
| **Site kind** | Why a line was chosen: `return`, `assign`, `if`, `elif`, `raise`, `loop` (see `src/analysis/captureSites.ts`). |
| **Snapshot** | Full locals at a capture site when the debugger stops — stored via `TraceManager.appendState` (`VariableInfo[]` per hit). |
| **Full trace** | For each **captured** line: complete stored locals (+ history per line if hit multiple times). **Hover** and CodeLens / `showLineTrace` = full snapshot. |
| **Inline projection** | LLM-filtered subset of a snapshot shown as ghost text (`⟨PB⟩ …`) at end of line. |
| **Default path** | `breakpoint-continue`: hit site → capture → **`continue`** → repeat until session ends. No instruction stepping. |
| **Exhaustive path** | `exhaustive-step`: owned `DebugExecutor` loops `stepIn` — every stopped line can be captured; slow, for small files / research. |
| **Observed session** | User or Run PB started debug; `SessionOrchestrator` attaches planner + capture engine. |
| **Owned session** | `DebugExecutor` started debug (e.g. Exhaustive Trace); orchestrator does not double-attach. |

### What gets stored vs shown

| Layer | Content |
| --- | --- |
| **Capture sites** | Lines where snapshots **may** exist (AST/heuristic breakpoints). |
| **Snapshot content** | All locals the debugger exposes at that site (filtered by tracker, not by LLM). |
| **Store** | `TraceManager` — per session, per file, per line; latest hit used for display by default. |
| **Inline display** | LLM subset (`LLMFilterService`); falls back to first few raw vars if LLM off or empty. |
| **Hover / CodeLens** | Full snapshot for that line. |

### Capture site policy (v1)

| Kind | AST nodes (summary) | Line |
| --- | --- | --- |
| **return** | `Return` | `lineno` |
| **assign** | `Assign`, `AnnAssign`, `AugAssign` (not `_` discard) | `lineno` |
| **if** | `If` test | `lineno` |
| **elif** | `If` in `orelse` chain | `lineno` |
| **raise** | `Raise` | `lineno` |
| **loop** | `For` / `While` (and async variants) header | `lineno`, capped by `maxLoopCaptureSitesPerFile` |

**Out of scope for v1:** bare calls, `import`, `try`/`except`, `with`, decorators, function/class defs (may add later).

### Pipeline (contract view)

```text
run / continue → hit capture-site BP → snapshot (full locals) → appendState → continue
                                                              ↓
                                    LLM → inline projection; hover / CodeLens → full snapshot
```

**Coverage rule:** Lines without a capture site have **no** PB trace by design — not an error.

**Stepping:** Exhaustive mode is optional and non-default; product default is breakpoint + continue only.

---

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
- critical points: change to AST first, then LLM first pass to detect critical lines 
- the breakpoints might be confused with the breakpoints in an actual debugger? -> need to have a better flow and have it be less of a debugger

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

**Step 1 — Contract** — done; see [Contract](#contract) above.

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