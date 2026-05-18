import * as vscode from 'vscode';
import { pbLog } from '../pbOutput';
import { BreakpointCaptureEngine } from './BreakpointCaptureEngine';
import { BreakpointPlanner } from './BreakpointPlanner';
import { TraceManager } from '../tracking/TraceManager';
import { waitForDebugSessionEnd } from './waitForDebugSessionEnd';

export interface BreakpointTracingRunOptions {
    debugSession: vscode.DebugSession;
    traceSessionId: string;
    entryPoint: string;
    traceManager: TraceManager;
    onCaptured?: (filePath: string) => void;
    /** When breakpoints were set before launch (orchestrator pre-launch path). */
    preLaunchPlanner?: BreakpointPlanner;
}

/**
 * Phase 4 — Shared breakpoint capture lifecycle: plan sites → set BPs → engine → wait for end.
 */
export class BreakpointTracingRun implements vscode.Disposable {
    private planner?: BreakpointPlanner;
    private captureEngine?: BreakpointCaptureEngine;
    private ownsPlanner = false;

    public async run(options: BreakpointTracingRunOptions): Promise<void> {
        const { debugSession, traceSessionId, entryPoint, traceManager, onCaptured } = options;

        let planner = options.preLaunchPlanner;
        if (planner) {
            this.planner = planner;
            this.ownsPlanner = false;
        } else {
            planner = new BreakpointPlanner();
            this.planner = planner;
            this.ownsPlanner = true;

            const sites = await planner.planSites(entryPoint);
            if (sites.length === 0) {
                pbLog('BreakpointTracingRun: no capture sites found');
            } else {
                await planner.setBreakpoints(sites);
                pbLog(`BreakpointTracingRun: ${sites.length} breakpoint(s) set`);
            }
        }

        this.captureEngine = new BreakpointCaptureEngine(
            debugSession,
            traceSessionId,
            entryPoint,
            traceManager,
            planner.getPlannedSites(),
            onCaptured
        );

        pbLog(`BreakpointTracingRun: waiting for debug session ${debugSession.id} to end`);
        await waitForDebugSessionEnd(debugSession.id);
    }

    public dispose(): void {
        this.captureEngine?.dispose();
        this.captureEngine = undefined;

        if (this.ownsPlanner) {
            this.planner?.dispose();
        }
        this.planner = undefined;
    }
}
