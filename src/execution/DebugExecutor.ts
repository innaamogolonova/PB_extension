import * as vscode from 'vscode';
import * as path from 'path';
import { getCaptureMode } from '../config';
import { ILanguageExecutor } from './ILanguageExecutor';
import {
    createPbSessionPolicy,
    registerOwnedDebugSession,
    unregisterOwnedDebugSession
} from '../sessionPolicy';
import { ExecutionTrace, PbCaptureMode } from '../types';
import { DebugValueTracker } from '../tracking/DebugValueTracker';
import { TraceManager } from '../tracking/TraceManager';
import { executionTraceFromSession } from '../tracking/traceAdapter';
import { BreakpointPlanner } from '../orchestration/BreakpointPlanner';
import { BreakpointTracingRun } from '../orchestration/BreakpointTracingRun';
import { pbLog } from '../pbOutput';

export interface DebugExecutorRunOptions {
    /** Overrides `pbExtension.captureMode` for this run only. */
    captureMode?: PbCaptureMode;
    onCaptured?: (filePath: string) => void;
}

export class DebugExecutor implements ILanguageExecutor {
    private languageId: string;
    private debugType: string;
    private traceManager: TraceManager;
    private currentSession?: vscode.DebugSession;
    private valueTracker?: DebugValueTracker;
    private breakpointRun?: BreakpointTracingRun;
    private activeTraceSessionId?: string;
    private disposables: vscode.Disposable[] = [];

    constructor(languageId: string, debugType: string, traceManager: TraceManager) {
        this.languageId = languageId;
        this.debugType = debugType;
        this.traceManager = traceManager;
    }

    public canExecute(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();
        if (this.languageId === 'python' && (ext === '.py' || ext === '.pyw')) {
            return true;
        }
        return false;
    }

    public getLanguageId(): string {
        return this.languageId;
    }

    public async execute(filePath: string, options?: DebugExecutorRunOptions): Promise<ExecutionTrace> {
        const captureMode = options?.captureMode ?? getCaptureMode();
        pbLog(`[DebugExecutor] captureMode=${captureMode}`);

        this.activeTraceSessionId = this.traceManager.createSession(filePath, this.languageId);

        try {
            const { session, preLaunchPlanner } = await this.launchDebugSession(filePath, captureMode);
            this.currentSession = session;

            registerOwnedDebugSession(session.id);
            const sessionPolicy = createPbSessionPolicy(session, 'owned', captureMode);
            pbLog(
                `[DebugExecutor] session policy: role=${sessionPolicy.role}, captureMode=${sessionPolicy.captureMode}`
            );

            if (captureMode === 'breakpoint-continue') {
                await this.runBreakpointCapture(session, filePath, preLaunchPlanner, options?.onCaptured);
            } else {
                await this.runExhaustiveCapture(session, filePath);
            }

            const trace = executionTraceFromSession(
                this.traceManager,
                this.activeTraceSessionId,
                filePath
            );

            this.traceManager.finalizeSession(this.activeTraceSessionId, {
                success: trace.success,
                error: trace.error
            });

            return trace;
        } catch (err) {
            const errorMessage = String(err);
            if (this.activeTraceSessionId) {
                this.traceManager.finalizeSession(this.activeTraceSessionId, {
                    success: false,
                    error: errorMessage
                });
            }

            return {
                filePath,
                language: this.languageId,
                lineStates: new Map(),
                executionStart: new Date(),
                executionEnd: new Date(),
                success: false,
                error: errorMessage
            };
        }
    }

    private async launchDebugSession(
        filePath: string,
        captureMode: PbCaptureMode
    ): Promise<{ session: vscode.DebugSession; preLaunchPlanner?: BreakpointPlanner }> {
        let preLaunchPlanner: BreakpointPlanner | undefined;

        if (captureMode === 'breakpoint-continue') {
            preLaunchPlanner = new BreakpointPlanner();
            const sites = await preLaunchPlanner.planSites(filePath);
            if (sites.length > 0) {
                await preLaunchPlanner.setBreakpoints(sites);
                pbLog(`[DebugExecutor] pre-launch: ${sites.length} breakpoint(s)`);
            }
        }

        const debugConfig = this.createDebugConfig(filePath);
        let capturedSession: vscode.DebugSession | undefined;

        const sessionListener = vscode.debug.onDidStartDebugSession((session) => {
            capturedSession = session;
        });
        this.disposables.push(sessionListener);

        const started = await vscode.debug.startDebugging(undefined, debugConfig);
        sessionListener.dispose();

        if (!started) {
            preLaunchPlanner?.dispose();
            throw new Error('Failed to start debug session');
        }

        if (!capturedSession) {
            preLaunchPlanner?.dispose();
            throw new Error('Debug session was not captured');
        }

        return { session: capturedSession, preLaunchPlanner };
    }

    private async runBreakpointCapture(
        session: vscode.DebugSession,
        filePath: string,
        preLaunchPlanner: BreakpointPlanner | undefined,
        onCaptured?: (filePath: string) => void
    ): Promise<void> {
        if (!this.activeTraceSessionId) {
            throw new Error('No active trace session');
        }

        this.breakpointRun = new BreakpointTracingRun();
        await this.breakpointRun.run({
            debugSession: session,
            traceSessionId: this.activeTraceSessionId,
            entryPoint: filePath,
            traceManager: this.traceManager,
            onCaptured,
            preLaunchPlanner
        });
    }

    private async runExhaustiveCapture(session: vscode.DebugSession, filePath: string): Promise<void> {
        if (!this.activeTraceSessionId) {
            throw new Error('No active trace session');
        }

        this.valueTracker = new DebugValueTracker(
            this.languageId,
            this.activeTraceSessionId,
            this.traceManager,
            filePath
        );
        this.valueTracker.startTracking(session);

        await new Promise((resolve) => setTimeout(resolve, 100));

        const threadId = await this.getThreadId(session);
        await session.customRequest('stepIn', { threadId });
        pbLog('[DebugExecutor] Sent initial stepIn (exhaustive mode)');

        await this.startSteppingLoop(session, threadId);
    }

    private createDebugConfig(filePath: string): vscode.DebugConfiguration {
        if (this.languageId === 'python') {
            return {
                type: this.debugType,
                request: 'launch',
                name: 'PB Python Debug',
                program: filePath,
                stopOnEntry: true,
                console: 'integratedTerminal',
                justMyCode: true,
                cwd: path.dirname(filePath)
            };
        }

        throw new Error(`Unsupported language: ${this.languageId}`);
    }

    private async getThreadId(session: vscode.DebugSession): Promise<number> {
        const response = await session.customRequest('threads', {});
        const thread = response.threads[0];

        if (!thread) {
            throw new Error('No threads found in debug session');
        }

        return thread.id;
    }

    private async startSteppingLoop(session: vscode.DebugSession, threadId: number): Promise<void> {
        pbLog('[DebugExecutor] Starting exhaustive stepping loop');

        while (session === vscode.debug.activeDebugSession) {
            try {
                const stackTrace = await session.customRequest('stackTrace', {
                    threadId,
                    startFrame: 0,
                    levels: 1
                });

                if (!stackTrace.stackFrames || stackTrace.stackFrames.length === 0) {
                    pbLog('[DebugExecutor] No stack frames, execution complete');
                    break;
                }

                await this.valueTracker?.captureAtCurrentPosition(threadId);
                await new Promise((resolve) => setTimeout(resolve, 100));
                await session.customRequest('stepIn', { threadId });
                await new Promise((resolve) => setTimeout(resolve, 100));
            } catch (err) {
                pbLog(`[DebugExecutor] Stepping ended: ${err}`);
                break;
            }
        }

        pbLog('[DebugExecutor] Exhaustive stepping loop finished');
    }

    public dispose(): void {
        if (this.currentSession) {
            unregisterOwnedDebugSession(this.currentSession.id);
            void vscode.debug.stopDebugging(this.currentSession);
            this.currentSession = undefined;
        }
        this.breakpointRun?.dispose();
        this.breakpointRun = undefined;
        if (this.valueTracker) {
            this.valueTracker.dispose();
            this.valueTracker = undefined;
        }
        this.disposables.forEach((d) => d.dispose());
        this.disposables = [];
    }

    public static traceToJSON(trace: ExecutionTrace): object {
        return {
            ...trace,
            lineStates: Object.fromEntries(trace.lineStates)
        };
    }
}
