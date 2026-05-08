import * as vscode from 'vscode';
import * as path from 'path';
import { ILanguageExecutor } from './ILanguageExecutor';
import { ExecutionTrace } from '../types';
import { DebugValueTracker } from '../tracking/DebugValueTracker';
import { TraceManager } from '../tracking/TraceManager';

export class DebugExecutor implements ILanguageExecutor {

    private languageId: string;
    private debugType: string;
    private traceManager: TraceManager;
    private currentSession?: vscode.DebugSession;
    private valueTracker?: DebugValueTracker;
    private activeTraceSessionId?: string;
    private disposables: vscode.Disposable[] = [];

    constructor(languageId: string, debugType: string, traceManager: TraceManager) {
        this.languageId = languageId;
        this.debugType = debugType;
        this.traceManager = traceManager;
    }

    // check if executor can handle file
    public canExecute(filePath: string): boolean {
        // for MVP: just check the extension
        const ext = path.extname(filePath).toLowerCase();
        if (this.languageId === 'python' && (ext === '.py' || ext === '.pyw')) {
            return true;
        }
        if (this.languageId === 'javascript' && (ext === '.js' || ext === '.mjs')) {
            return true;
        }
        return false;

        // TODO later: can check if debugger is installed
    }

    public getLanguageId(): string {
        return this.languageId;
    }

    public async execute(filePath: string): Promise<ExecutionTrace> {
        this.activeTraceSessionId = this.traceManager.createSession(filePath, this.languageId);

        try {
            const debugConfig = this.createDebugConfig(filePath);
            this.valueTracker = new DebugValueTracker(this.languageId, this.activeTraceSessionId, this.traceManager, filePath);

            // will hold session reference
            let capturedSession: vscode.DebugSession | undefined;

            // register listener before starting the debug, stores session when fired
            const sessionListener = vscode.debug.onDidStartDebugSession((session) => {
                capturedSession = session;
            });

            this.disposables.push(sessionListener);

            // start debugging
            const started = await vscode.debug.startDebugging(undefined, debugConfig);
            if (!started) {
                throw new Error('Failed to start debug session');
            }

            if (!capturedSession) {
                sessionListener.dispose();
                throw new Error('Debug session was not captured');
            }

            this.currentSession = capturedSession;
            sessionListener.dispose();

            this.valueTracker.startTracking(capturedSession);

            await new Promise(resolve => setTimeout(resolve, 100));

            const threadId = await this.getThreadId(capturedSession);
            await capturedSession.customRequest('stepIn', { threadId });
            console.log('[DebugExecutor] Sent initial stepIn command');

            await this.startSteppingLoop(capturedSession, threadId);

            const trace = this.valueTracker.getTrace();
            this.traceManager.finalizeSession(this.activeTraceSessionId, { success: trace.success, error: trace.error });

            return trace;
        } catch (err) {
            const errorMessage = String(err);
            if (this.activeTraceSessionId) {
                this.traceManager.finalizeSession(this.activeTraceSessionId, { success: false, error: errorMessage });
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


    private createDebugConfig(filePath: string): vscode.DebugConfiguration {
        if (this.languageId === 'python') {
            return {
                type: this.debugType,
                request: 'launch',
                name: 'Debug Python File',
                program: filePath,
                stopOnEntry: true,
                console: 'integratedTerminal',
                justMyCode: true
            };
        } else if (this.languageId === 'javascript') {
            return {
                type: this.debugType,
                request: 'launch',
                name: 'Debug JavaScript File',
                program: filePath,
                stopOnEntry: true,
                console: 'integratedTerminal'
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
        console.log('[DebugExecutor] Starting polling-based stepping loop');

        while (session === vscode.debug.activeDebugSession) {
            try {
                const stackTrace = await session.customRequest('stackTrace', {
                    threadId,
                    startFrame: 0,
                    levels: 1
                });

                if (!stackTrace.stackFrames || stackTrace.stackFrames.length === 0) {
                    console.log('[DebugExecutor] No stack frames, execution complete');
                    break;
                }

                const frame = stackTrace.stackFrames[0];
                console.log(`[DebugExecutor] At line ${frame.line}, stepping...`);

                // Capture variables at this stop (across all frames)
                await this.valueTracker?.captureAtCurrentPosition(threadId);

                await new Promise(resolve => setTimeout(resolve, 100));

                await session.customRequest('stepIn', { threadId });

                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (err) {
                console.log(`[DebugExecutor] Stepping ended: ${err}`);
                break;
            }
        }

        console.log('[DebugExecutor] Stepping loop finished');
    }

    public dispose(): void {
        if (this.currentSession) {
            void vscode.debug.stopDebugging(this.currentSession);
            this.currentSession = undefined;
        }
        if (this.valueTracker) {
            this.valueTracker.dispose();
            this.valueTracker = undefined;
        }
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }

    public static traceToJSON(trace: ExecutionTrace): object {
        return {
            ...trace,
            lineStates: Object.fromEntries(trace.lineStates)
        };
    }
}
