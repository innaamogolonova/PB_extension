import * as vscode from 'vscode';
import {
    createPbSessionPolicy,
    getSessionRole,
    isOwnedDebugSession
} from '../sessionPolicy';
import { TraceManager } from '../tracking/TraceManager';
import { PbTraceSession } from './PbTraceSession';
import { resolveEntryPoint } from './resolveEntryPoint';

const ATTACHED_TRACING_STATE_KEY = 'pbExtension.attachedTracingEnabled';

/**
 * M1 — Session orchestration: attach lifecycle to VS Code debug sessions.
 * Phase 1: create/finalize TraceSession for observed Python debug only; no capture yet.
 */
export class SessionOrchestrator implements vscode.Disposable {
    private readonly traceManager: TraceManager;
    private readonly context: vscode.ExtensionContext;
    private readonly disposables: vscode.Disposable[] = [];
    private readonly activePbSessions = new Map<string, PbTraceSession>();

    private attachedTracingEnabled = false;
    private statusBarItem?: vscode.StatusBarItem;

    constructor(traceManager: TraceManager, context: vscode.ExtensionContext) {
        this.traceManager = traceManager;
        this.context = context;
        this.attachedTracingEnabled = context.globalState.get<boolean>(
            ATTACHED_TRACING_STATE_KEY,
            false
        );

        this.registerListeners();
        this.createStatusBar();
        this.updateStatusBar();

        if (this.attachedTracingEnabled && vscode.debug.activeDebugSession) {
            this.handleDebugSessionStart(vscode.debug.activeDebugSession);
        }
    }

    public isAttachedTracingEnabled(): boolean {
        return this.attachedTracingEnabled;
    }

    public async startAttachedTracing(): Promise<void> {
        this.attachedTracingEnabled = true;
        await this.context.globalState.update(ATTACHED_TRACING_STATE_KEY, true);
        this.updateStatusBar();

        vscode.window.showInformationMessage(
            'PB tracing enabled. Start Python debug (F5) to begin a trace session.'
        );

        const activeSession = vscode.debug.activeDebugSession;
        if (activeSession) {
            this.handleDebugSessionStart(activeSession);
        }
    }

    public async stopAttachedTracing(): Promise<void> {
        this.attachedTracingEnabled = false;
        await this.context.globalState.update(ATTACHED_TRACING_STATE_KEY, false);
        this.updateStatusBar();

        for (const [debugSessionId, pbSession] of [...this.activePbSessions.entries()]) {
            if (pbSession.role === 'observed') {
                pbSession.finalize({ success: true });
                this.activePbSessions.delete(debugSessionId);
            }
        }

        vscode.window.showInformationMessage('PB tracing disabled.');
    }

    public dispose(): void {
        for (const pbSession of this.activePbSessions.values()) {
            if (!pbSession.isFinalized()) {
                pbSession.finalize({ success: false, error: 'Extension deactivated' });
            }
        }
        this.activePbSessions.clear();

        this.statusBarItem?.dispose();
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables.length = 0;
    }

    private registerListeners(): void {
        this.disposables.push(
            vscode.debug.onDidStartDebugSession((session) => {
                this.handleDebugSessionStart(session);
            }),
            vscode.debug.onDidTerminateDebugSession((session) => {
                this.handleDebugSessionTerminate(session);
            }),
            vscode.debug.onDidChangeActiveDebugSession((session) => {
                this.handleActiveDebugSessionChanged(session);
            })
        );
    }

    private createStatusBar(): void {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
        this.statusBarItem.command = 'pbExtension.toggleAttachedTracing';
        this.statusBarItem.tooltip = 'Toggle PB attach tracing (F5 sessions)';
        this.statusBarItem.show();
        this.disposables.push(this.statusBarItem);
    }

    private updateStatusBar(): void {
        if (!this.statusBarItem) {
            return;
        }
        this.statusBarItem.text = this.attachedTracingEnabled ? '$(debug) PB: tracing' : '$(circle-slash) PB: off';
    }

    private handleDebugSessionStart(session: vscode.DebugSession): void {
        const role = getSessionRole(session, this.attachedTracingEnabled);
        if (!role) {
            return;
        }

        if (role === 'owned') {
            console.log(
                `[SessionOrchestrator] owned debug session started (trace created by DebugExecutor): id=${session.id}`
            );
            return;
        }

        if (this.activePbSessions.has(session.id)) {
            console.warn(`[SessionOrchestrator] duplicate start ignored: id=${session.id}`);
            return;
        }

        try {
            const entryPoint = resolveEntryPoint(session);
            const traceSessionId = this.traceManager.createSession(entryPoint, session.type);
            const policy = createPbSessionPolicy(session, role);
            const pbSession = new PbTraceSession(
                traceSessionId,
                session,
                role,
                policy,
                this.traceManager
            );

            this.activePbSessions.set(session.id, pbSession);
            console.log(
                `[SessionOrchestrator] observed trace started: debugId=${session.id} traceId=${traceSessionId} entry=${entryPoint}`
            );
        } catch (err) {
            console.error(`[SessionOrchestrator] failed to start observed trace: ${err}`);
        }
    }

    private handleDebugSessionTerminate(session: vscode.DebugSession): void {
        const pbSession = this.activePbSessions.get(session.id);
        if (pbSession) {
            pbSession.finalize({ success: true });
            this.activePbSessions.delete(session.id);
            console.log(`[SessionOrchestrator] observed trace finalized: debugId=${session.id}`);
            return;
        }

        if (isOwnedDebugSession(session.id)) {
            console.log(`[SessionOrchestrator] owned debug session terminated: id=${session.id}`);
        }
    }

    private handleActiveDebugSessionChanged(session: vscode.DebugSession | undefined): void {
        if (!session) {
            return;
        }

        const pbSession = this.activePbSessions.get(session.id);
        if (!pbSession || pbSession.isFinalized()) {
            return;
        }

        this.traceManager.setActiveSession(pbSession.traceSessionId);
        const current = this.traceManager.getCurrentSession();
        if (current?.entryPoint) {
            this.traceManager.setActiveFilePath(current.entryPoint);
        }
    }
}
