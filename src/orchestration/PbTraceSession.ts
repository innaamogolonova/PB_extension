import * as vscode from 'vscode';
import { unregisterOwnedDebugSession } from '../sessionPolicy';
import { PbSessionPolicy, PbSessionRole } from '../types';
import { TraceManager } from '../tracking/TraceManager';

/**
 * Links one VS Code debug session to one PB TraceManager session.
 */
export class PbTraceSession {
    readonly traceSessionId: string;
    readonly vscodeDebugSession: vscode.DebugSession;
    readonly role: PbSessionRole;
    readonly policy: PbSessionPolicy;

    private readonly traceManager: TraceManager;
    private readonly disposables: vscode.Disposable[] = [];
    private finalized = false;

    constructor(
        traceSessionId: string,
        vscodeDebugSession: vscode.DebugSession,
        role: PbSessionRole,
        policy: PbSessionPolicy,
        traceManager: TraceManager
    ) {
        this.traceSessionId = traceSessionId;
        this.vscodeDebugSession = vscodeDebugSession;
        this.role = role;
        this.policy = policy;
        this.traceManager = traceManager;
    }

    public addDisposable(disposable: vscode.Disposable): void {
        this.disposables.push(disposable);
    }

    public finalize(result: { success: boolean; error?: string }): void {
        if (this.finalized) {
            return;
        }
        this.finalized = true;

        this.traceManager.finalizeSession(this.traceSessionId, result);

        if (this.role === 'owned') {
            unregisterOwnedDebugSession(this.vscodeDebugSession.id);
        }

        this.dispose();
    }

    public isFinalized(): boolean {
        return this.finalized;
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables.length = 0;
    }
}
