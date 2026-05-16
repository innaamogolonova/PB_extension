# Attach + Capture at Breakpoints — Implementation Plan

Detailed, modular plan for the attach + heuristic-breakpoint pivot, aligned with the current repo (`extension.ts`, `DebugExecutor`, `DebugValueTracker`, `TraceManager`, `CriticalPointDetector`, display layer).

---

## Guiding contract

| Term | Meaning |
|------|---------|
| **Attach mode** | Extension listens to **existing** VS Code debug sessions; does not rely on a `stepIn` loop for capture. |
| **Capture site** | A source line where the extension sets a breakpoint (heuristic now; LLM or AST later). |
| **Snapshot** | Full locals (current `appendState` shape) at that line when the debugger stops. |
| **Full trace** | For each **captured** line: stored locals + history policy; hover = full; inline = LLM subset. |
| **Default path** | `continue` between stops; **no** instruction stepping. |

---

## Module map (logical layers)

```
┌─────────────────────────────────────────────────────────┐
│ M1 SessionOrchestrator    attach / own-session policy    │
├─────────────────────────────────────────────────────────┤
│ M2 BreakpointPlanner      URIs + lines → DAP breakpoints │
├─────────────────────────────────────────────────────────┤
│ M3 CaptureEngine          stopped → captureFromThread      │
├─────────────────────────────────────────────────────────┤
│ M4 TraceStore             TraceManager (existing)          │
├─────────────────────────────────────────────────────────┤
│ M5 Presentation           Annotations + hover + LLM       │
└─────────────────────────────────────────────────────────┘
```

Dependencies: **M1 → M2 → M3 → M4**; **M5** reads **M4** only.

---

## Phase 0 — Foundations (no behavior flip yet)

**Goals:** Shared vocabulary, flags, no user-facing regression.

| Task | Detail |
|------|--------|
| **0.1 Capture mode enum** | e.g. `exhaustive-step` vs `breakpoint-continue` (config or internal constant). |
| **0.2 Session ownership** | Define when PB “owns” a session vs “observes” one (filter by `session.type`, workspace folder, or explicit command). |
| **0.3 Docs** | One paragraph in `DETAILED_ARCH.md` or `NOTES.md`: attach vs owned session. |

**Exit:** Clean compile; existing `testDebugExecutor` unchanged.

---

## Phase 1 — Session orchestration (M1)

**Goals:** Start/stop PB trace lifecycle without rewriting capture.

| Module | Tasks |
|--------|-------|
| **1.1 Listeners** | Register `vscode.debug.onDidStartDebugSession`, `onDidTerminateDebugSession`, optionally `onDidChangeActiveDebugSession`. |
| **1.2 Session filter** | Only Python (`session.type === 'python'` or project-defined allowlist). Ignore unrelated sessions. |
| **1.3 Lifecycle object** | `PbTraceSession`: holds `sessionId` (your trace session id), `vscodeDebugSession` ref, `Disposable[]`, `finalize()` on terminate. |
| **1.4 TraceManager alignment** | On attach start: `traceManager.createSession(entryPoint, language)` — entry point = launch `program` / active editor / configurable (document decision). |
| **1.5 Commands** | Minimal UX: `PB: Start tracing attached session` (enable listener + maybe placeholder) vs implicit “always on when debugging.” Prefer **explicit toggle** first to avoid surprise breakpoints. |

**Exit:** Starting/stopping a Python debug session creates/finalizes a `TraceSession` in `TraceManager` with **no capture yet** (or only reuse existing stopped handler without breakpoints).

---

## Phase 2 — Breakpoint planner (M2)

**Goals:** Programmatic breakpoints at heuristic lines only.

| Module | Tasks |
|--------|-------|
| **2.1 Line discovery** | Feed `CriticalPointDetector` per **workspace Python file** or **opened editors only** (scope decision — start narrow: active workspace folder + skip `venv`, `site-packages`). |
| **2.2 URI mapping** | `vscode.Uri.file(fsPath)` ↔ document identity; normalize paths like `DebugValueTracker`. |
| **2.3 DAP breakpoints** | Use `vscode.debug.breakpoints` API: create `SourceBreakpoint` objects with `vscode.Location` per line. Tag with `condition`/`hitCondition` only if needed later. |
| **2.4 Enable/disable** | On trace start: set breakpoints; on trace stop / detach: **remove PB breakpoints** only (track with `Breakpoint`-private metadata if needed — VS Code may require custom ID scheme via `enabled` + bookkeeping). |
| **2.5 Conflict policy** | If user already has a breakpoint on same line: merge or skip (document; simplest = skip duplicate line). |

**Exit:** With PB tracing enabled, heuristic lines show breakpoints (or internal breakpoints if you use adapter-specific requests later — prefer VS Code API first).

---

## Phase 3 — Capture engine: breakpoint path (M3)

**Goals:** On stop at PB breakpoint, capture once and resume.

| Module | Tasks |
|--------|-------|
| **3.1 Stop classification** | On `stopped` event / equivalent: reason `breakpoint` vs `step` vs `pause`. Only capture for reasons you care about (start with `breakpoint`). |
| **3.2 Breakpoint identity** | Ensure stop is on a **PB-managed** line (compare `stackFrames[0].source.path` + `line` to planned set). |
| **3.3 Capture** | Reuse `captureFromThread` / `appendState` unchanged. |
| **3.4 Continue** | After capture completes: `session.customRequest('continue', { threadId })` (with thread id from stop body). Handle missing thread / errors gracefully. |
| **3.5 Dedupe** | Same line hit in a tight loop: either append every hit (current model) or keep **last N** / **latest only** — config flag. |
| **3.6 Race / re-entry** | Serialize capture+continue per session (simple mutex flag) so overlapping stops don’t corrupt ordering. |

**Exit:** Running under debug hits heuristic lines → states appear in `TraceManager`; execution proceeds without manual stepping.

---

## Phase 4 — Retire default stepping loop (integration)

**Goals:** `DebugExecutor` default becomes breakpoint-driven when orchestrator runs owned launches too.

| Module | Tasks |
|--------|-------|
| **4.1 Refactor `DebugExecutor`** | Split: `launchAndAttachTracker()` vs `runBreakpointCaptureLoop()` vs legacy `startSteppingLoop()`. |
| **4.2 Owned-session path** | When extension still calls `startDebugging`: after start, **set breakpoints + continue** instead of `stepIn` loop (unless mode = exhaustive). |
| **4.3 Legacy command** | Keep `pbExtension.testDebugExecutor` working: either migrate to new path or gate old stepping behind `pbExtension.exhaustiveTrace` / settings. |
| **4.4 Initial stop** | If `stopOnEntry`: optionally capture once then continue; or skip until first heuristic BP — choose one and document. |

**Exit:** Single codepath for “breakpoint capture”; stepping loop optional.

---

## Phase 5 — Presentation & UX (M5)

**Goals:** Same mental model as today; faster perceived feedback.

| Module | Tasks |
|--------|-------|
| **5.1 Incremental refresh** | After each `appendState`, optionally `applyAnnotations` for active editor (debounced ~50–100ms). |
| **5.2 LLM batching** | Batch LLM calls per file or chunk lines to reduce latency; cache keys already exist in `LLMFilterService`. |
| **5.3 Empty lines** | UX: no decoration where no snapshot — expected, not error. |
| **5.4 Status bar / notification** | “PB tracing: on / session python / N captures.” |

**Exit:** Inline + hover match design; long runs feel usable.

---

## Phase 6 — Staleness & refresh (ties to Phase 3 roadmap)

| Tasks |
|-------|
| `onDidChangeTextDocument` → `markFileStale` for touched files. |
| Decorations show subtle stale hint. |
| Command: **Refresh trace** → rerun last launch config or saved entrypoint (document MVP behavior). |

---

## Phase 7 — Hardening & scope

| Area | Tasks |
|------|-------|
| **Multi-file** | Already in `TraceManager`; verify breakpoints across packages under workspace. |
| **Performance** | Cap files scanned for breakpoints; exclude globs (`**/node_modules/**`, `**/.venv/**`). |
| **Tests** | Manual checklist in `tests_web_app` README; optional integration test with mocked DAP if feasible later. |
| **Future** | Swap **M2** heuristic list for LLM/AST line picker without touching **M3–M5**. |

---

## Milestones (dependency order)

| Milestone | Phases | Deliverable |
|-----------|--------|-------------|
| **M1** | 0–1 | Attach lifecycle + trace session create/finalize |
| **M2** | 2 | Heuristic breakpoints appear/disappear cleanly |
| **M3** | 3 | Capture + continue works end-to-end |
| **M4** | 4 | No default `stepIn`; legacy mode preserved |
| **M5** | 5–6 | UX + staleness |

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Breakpoints slow user debugging | PB-toggle off by default; scoped breakpoints; remove on terminate |
| Wrong session captured | Strict filter + explicit “start tracing” |
| `continue` drops missed captures | Serialize stop handling; log errors |
| Flask/server never hits heuristic lines | Widen detector or add manual “also trace these files” config later |

---

## Suggested first PR slice

**Smallest vertical slice:** Phase 1 (listener + session) + Phase 3 (capture on `breakpoint` stop + `continue`) **without** auto-setting breakpoints — user places one breakpoint manually to validate attach+capture+continue. Then add Phase 2 (auto heuristic breakpoints).
