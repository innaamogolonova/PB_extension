import * as path from 'path';
import * as vscode from 'vscode';
import { getPythonDebugAdapterType } from '../config';
import { pbLog } from '../pbOutput';
import {
    createPbSessionPolicy,
    getSessionIgnoreReason,
    getSessionRole,
    isOwnedDebugSession
} from '../sessionPolicy';
import { TraceManager } from '../tracking/TraceManager';
import { BreakpointCaptureEngine } from './BreakpointCaptureEngine';
import { BreakpointPlanner } from './BreakpointPlanner';
import { PbTraceSession } from './PbTraceSession';
import { getPbOutputChannel } from '../pbOutput';
import { resolveEntryPoint } from './resolveEntryPoint';

const ATTACHED_TRACING_STATE_KEY = 'pbExtension.attachedTracingEnabled';

interface DapStoppedMessage {
    type?: string;
    event?: string;
    body?: { reason?: string; threadId?: number };
}

/**
 * M1 — Session orchestration: attach lifecycle to VS Code debug sessions.
 * Phases 2–3: heuristic breakpoints + capture/continue on observed sessions.
 */
export class SessionOrchestrator implements vscode.Disposable {
    private readonly traceManager: TraceManager;
    private readonly context: vscode.ExtensionContext;
    private readonly onTraceUpdated?: (filePath?: string) => void;
    private readonly disposables: vscode.Disposable[] = [];
    private readonly activePbSessions = new Map<string, PbTraceSession>();
    private readonly captureEngines = new Map<string, BreakpointCaptureEngine>();
    private readonly pendingStoppedEvents = new Map<
        string,
        { reason?: string; threadId?: number }
    >();

    private attachedTracingEnabled = false;
    private statusBarItem?: vscode.StatusBarItem;
    private preLaunchPlanner?: BreakpointPlanner;
    private preLaunchEntryPoint?: string;

    constructor(
        traceManager: TraceManager,
        context: vscode.ExtensionContext,
        onTraceUpdated?: (filePath?: string) => void
    ) {
        this.traceManager = traceManager;
        this.context = context;
        this.onTraceUpdated = onTraceUpdated;
        this.attachedTracingEnabled = context.globalState.get<boolean>(
            ATTACHED_TRACING_STATE_KEY,
            false
        );

        this.registerGlobalDebugTracker();
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
            'PB tracing on. Open a .py file and run "PB: Run PB", or F5 with Python: Current File.'
        );
        pbLog('Attach tracing enabled.');

        const activeSession = vscode.debug.activeDebugSession;
        if (activeSession) {
            this.handleDebugSessionStart(activeSession);
        }
    }

    /**
     * Reliable attach path: enable tracing and start a Python debug session for the active editor.
     */
    /** Primary Run PB entry (breakpoint-continue via attach orchestrator). */
    public async runPbDebugCurrentFile(): Promise<void> {
        await this.debugCurrentPythonFileWithTracing();
    }

    public async debugCurrentPythonFileWithTracing(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('Open a Python file to debug.');
            return;
        }

        const filePath = editor.document.uri.fsPath;
        if (editor.document.languageId !== 'python' && !filePath.endsWith('.py') && !filePath.endsWith('.pyw')) {
            vscode.window.showErrorMessage('Active file is not Python.');
            return;
        }

        if (!this.attachedTracingEnabled) {
            await this.startAttachedTracing();
        }

        // Set breakpoints before the debug session starts (avoids race with fast scripts).
        const prePlanner = new BreakpointPlanner();
        const sites = await prePlanner.planSites(filePath);
        if (sites.length > 0) {
            await prePlanner.setBreakpoints(sites);
            pbLog(`Pre-launch: ${sites.length} breakpoint(s) set before debug start`);
        } else {
            pbLog('Pre-launch: no heuristic lines found');
        }
        this.preLaunchPlanner = prePlanner;
        this.preLaunchEntryPoint = filePath;

        const baseConfig = {
            request: 'launch' as const,
            name: 'PB Python Debug',
            program: filePath,
            console: 'integratedTerminal' as const,
            justMyCode: true,
            stopOnEntry: true,
            cwd: path.dirname(filePath)
        };

        const typesToTry = [getPythonDebugAdapterType(), 'python'];
        let started = false;
        for (const debugType of typesToTry) {
            pbLog(`Starting ${debugType} debug for ${filePath}`);
            started = await vscode.debug.startDebugging(undefined, {
                ...baseConfig,
                type: debugType
            });
            if (started) {
                break;
            }
        }

        if (!started) {
            this.clearPreLaunchPlanner();
        }

        if (!started) {
            const msg =
                'Could not start Python debug. Install the Python and Python Debugger extensions, then try again.';
            pbLog(msg);
            vscode.window.showErrorMessage(msg);
            return;
        }

        vscode.window.showInformationMessage(`PB: debugging ${path.basename(filePath)}…`);
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

    /**
     * Must be registered before any debug session starts so debugpy stopped events are received.
     */
    private registerGlobalDebugTracker(): void {
        const factory: vscode.DebugAdapterTrackerFactory = {
            createDebugAdapterTracker: (session) => ({
                onWillReceiveMessage: (message: DapStoppedMessage) => {
                    if (message.type !== 'event' || message.event !== 'stopped' || !message.body) {
                        return;
                    }
                    const engine = this.captureEngines.get(session.id);
                    if (!engine) {
                        if (
                            this.activePbSessions.has(session.id) ||
                            this.preLaunchEntryPoint !== undefined
                        ) {
                            this.pendingStoppedEvents.set(session.id, message.body);
                            pbLog(
                                `DAP stopped queued (engine not ready): reason=${message.body.reason ?? 'unknown'}`
                            );
                        }
                        return;
                    }
                    pbLog(`DAP stopped: reason=${message.body.reason ?? 'unknown'}`);
                    void engine.handleStopped(message.body);
                }
            })
        };

        this.disposables.push(
            vscode.debug.registerDebugAdapterTrackerFactory('debugpy', factory),
            vscode.debug.registerDebugAdapterTrackerFactory('python', factory)
        );
    }

    private clearPreLaunchPlanner(): void {
        this.preLaunchPlanner?.dispose();
        this.preLaunchPlanner = undefined;
        this.preLaunchEntryPoint = undefined;
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
        pbLog(`Debug session started: type=${session.type} name=${session.name} id=${session.id}`);

        const role = getSessionRole(session, this.attachedTracingEnabled);
        if (!role) {
            const reason = getSessionIgnoreReason(session, this.attachedTracingEnabled);
            if (reason) {
                pbLog(`Not attaching: ${reason}`);
                if (this.attachedTracingEnabled) {
                    void vscode.window.showWarningMessage(`PB: ${reason}`, { modal: false });
                }
            }
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
            pbLog(
                `Observed trace started: debugId=${session.id} traceId=${traceSessionId} entry=${entryPoint}`
            );
            getPbOutputChannel().show(true);

            if (this.preLaunchPlanner && this.preLaunchEntryPoint === entryPoint) {
                this.attachCaptureEngine(pbSession, session, entryPoint, this.preLaunchPlanner);
                this.preLaunchPlanner = undefined;
                this.preLaunchEntryPoint = undefined;
            } else {
                void this.setupBreakpointTracing(pbSession, entryPoint, session);
            }
        } catch (err) {
            const msg = `Failed to start observed trace: ${err}`;
            pbLog(msg);
            void vscode.window.showErrorMessage(`PB: ${msg}`);
        }
    }

    private attachCaptureEngine(
        pbSession: PbTraceSession,
        debugSession: vscode.DebugSession,
        entryPoint: string,
        planner: BreakpointPlanner
    ): void {
        pbSession.addDisposable(planner);

        const captureEngine = new BreakpointCaptureEngine(
            debugSession,
            pbSession.traceSessionId,
            entryPoint,
            this.traceManager,
            planner.getPlannedSites(),
            this.onTraceUpdated
        );

        this.captureEngines.set(debugSession.id, captureEngine);
        pbSession.addDisposable({
            dispose: () => {
                this.captureEngines.delete(debugSession.id);
            }
        });
        pbSession.addDisposable(captureEngine);
        pbLog(`Capture engine registered for debug session ${debugSession.id}`);

        const pending = this.pendingStoppedEvents.get(debugSession.id);
        if (pending) {
            this.pendingStoppedEvents.delete(debugSession.id);
            pbLog(`Replaying queued stopped event: reason=${pending.reason ?? 'unknown'}`);
            void captureEngine.handleStopped(pending);
        }
    }

    private async setupBreakpointTracing(
        pbSession: PbTraceSession,
        entryPoint: string,
        debugSession: vscode.DebugSession
    ): Promise<void> {
        if (pbSession.isFinalized()) {
            return;
        }

        const planner = new BreakpointPlanner();
        pbSession.addDisposable(planner);

        try {
            const sites = await planner.planSites(entryPoint);

            if (sites.length === 0) {
                const warn =
                    'No capture sites found (AST: return, assign, if/elif, raise, loops). Try tests/web_app/services.py.';
                pbLog(warn);
                void vscode.window.showWarningMessage(`PB: ${warn}`);
            } else {
                await planner.setBreakpoints(sites);
                pbLog(`Set ${sites.length} PB breakpoint(s).`);
            }

            this.attachCaptureEngine(pbSession, debugSession, entryPoint, planner);
        } catch (err) {
            pbLog(`breakpoint tracing setup failed: ${err}`);
            planner.dispose();
        }
    }

    private handleDebugSessionTerminate(session: vscode.DebugSession): void {
        this.captureEngines.delete(session.id);
        this.pendingStoppedEvents.delete(session.id);

        const pbSession = this.activePbSessions.get(session.id);
        if (pbSession) {
            const entryPoint = this.traceManager.getSession(pbSession.traceSessionId)?.entryPoint;
            const lineCount = entryPoint
                ? this.traceManager.getTracedLineNumbers(entryPoint).length
                : 0;
            this.traceManager.setActiveSession(pbSession.traceSessionId);
            if (entryPoint) {
                this.traceManager.setActiveFilePath(entryPoint);
                this.traceManager.pinActiveSessionForFile(entryPoint);
            }

            pbSession.finalize({ success: true });
            this.activePbSessions.delete(session.id);
            pbLog(`Observed trace finalized: debugId=${session.id} (${lineCount} line(s) with captures)`);
            if (entryPoint) {
                void this.onTraceUpdated?.(entryPoint);
                if (lineCount > 0) {
                    void vscode.window.showInformationMessage(
                        `PB: trace ready — ${lineCount} line(s). Ghost text and CodeLens updated.`
                    );
                }
            }
            return;
        }

        if (this.preLaunchEntryPoint) {
            this.clearPreLaunchPlanner();
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
