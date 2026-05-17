import * as vscode from 'vscode';
import { pbLog } from '../pbOutput';
import { DebugValueTracker } from '../tracking/DebugValueTracker';
import { TraceManager } from '../tracking/TraceManager';
import { captureSiteKey, captureSiteKeysForPath, normalizeSourcePath } from './pathUtils';

interface StoppedEventBody {
    reason?: string;
    threadId?: number;
}

/**
 * M3 — Capture at PB breakpoint sites and auto-continue.
 * Primary path: poll stack while debug session is paused (DAP stopped events are unreliable in some hosts).
 */
export class BreakpointCaptureEngine implements vscode.Disposable {
    private readonly debugSession: vscode.DebugSession;
    private readonly entryPoint: string;
    private readonly tracker: DebugValueTracker;
    private readonly plannedSites: ReadonlySet<string>;
    private readonly onCaptured?: (filePath: string) => void;
    private readonly autoContinue: boolean;
    private readonly disposables: vscode.Disposable[] = [];

    private handlingStop = false;
    private pollTimer?: ReturnType<typeof setInterval>;
    /** Prevents duplicate capture while still paused on the same stop. */
    private pausedSiteKey?: string;
    private entryContinueDone = false;

    constructor(
        debugSession: vscode.DebugSession,
        traceSessionId: string,
        entryPoint: string,
        traceManager: TraceManager,
        plannedSites: ReadonlySet<string>,
        onCaptured?: (filePath: string) => void
    ) {
        this.debugSession = debugSession;
        this.entryPoint = entryPoint;
        this.plannedSites = plannedSites;
        this.onCaptured = onCaptured;
        this.autoContinue = vscode.workspace
            .getConfiguration('pbExtension')
            .get<boolean>('autoContinue', true);

        this.tracker = new DebugValueTracker('python', traceSessionId, traceManager, entryPoint);
        this.tracker.bindDebugSession(debugSession);

        this.registerCustomStoppedFallback();
        this.startCapturePoller();

        pbLog(
            `BreakpointCaptureEngine: ready (${plannedSites.size} site(s), poller on, autoContinue=${this.autoContinue})`
        );
    }

    private registerCustomStoppedFallback(): void {
        this.disposables.push(
            vscode.debug.onDidReceiveDebugSessionCustomEvent((event) => {
                if (event.session.id !== this.debugSession.id || event.event !== 'stopped') {
                    return;
                }
                pbLog('Custom stopped event received');
                void this.handleStopped(event.body as StoppedEventBody);
            })
        );
    }

    private startCapturePoller(): void {
        this.pollTimer = setInterval(() => {
            void this.pollWhilePaused();
        }, 250);

        this.disposables.push({
            dispose: () => {
                if (this.pollTimer !== undefined) {
                    clearInterval(this.pollTimer);
                    this.pollTimer = undefined;
                }
            }
        });
    }

    /**
     * Polls stack trace while paused. Works when DebugAdapterTracker stopped events never fire.
     */
    private async pollWhilePaused(): Promise<void> {
        if (this.handlingStop) {
            return;
        }
        if (vscode.debug.activeDebugSession?.id !== this.debugSession.id) {
            return;
        }

        this.handlingStop = true;
        try {
            const threadId = await this.getThreadId();
            if (threadId === undefined) {
                this.pausedSiteKey = undefined;
                return;
            }

            let evaluation: { shouldCapture: boolean; frameKey?: string };
            try {
                evaluation = await this.evaluatePbStop(threadId);
            } catch {
                this.pausedSiteKey = undefined;
                return;
            }

            if (!evaluation.shouldCapture) {
                if (!this.entryContinueDone && this.autoContinue) {
                    this.entryContinueDone = true;
                    await this.safeContinue(threadId, 'entry');
                }
                return;
            }

            const siteKey = evaluation.frameKey!;
            if (siteKey === this.pausedSiteKey) {
                return;
            }
            this.pausedSiteKey = siteKey;

            await this.tracker.captureFromThread(threadId);
            pbLog(`Captured at ${siteKey}`);
            this.onCaptured?.(this.entryPoint);

            if (this.autoContinue) {
                await this.safeContinue(threadId, 'breakpoint');
                this.pausedSiteKey = undefined;
            }
        } finally {
            this.handlingStop = false;
        }
    }

    public async handleStopped(body: StoppedEventBody): Promise<void> {
        if (this.handlingStop) {
            return;
        }

        const reason = body.reason ?? '';
        const threadId = body.threadId;

        if (threadId === undefined) {
            return;
        }

        if (reason === 'entry') {
            if (!this.entryContinueDone && this.autoContinue) {
                this.entryContinueDone = true;
                await this.safeContinue(threadId, 'entry');
            }
            return;
        }

        if (reason !== 'breakpoint') {
            return;
        }

        await this.pollWhilePaused();
    }

    private async getThreadId(): Promise<number | undefined> {
        try {
            const response = await this.debugSession.customRequest('threads', {});
            const thread = response.threads?.[0] as { id?: number } | undefined;
            return thread?.id;
        } catch {
            return undefined;
        }
    }

    private async evaluatePbStop(
        threadId: number
    ): Promise<{ shouldCapture: boolean; frameKey?: string }> {
        if (this.plannedSites.size === 0) {
            return { shouldCapture: false };
        }

        const response = await this.debugSession.customRequest('stackTrace', {
            threadId,
            startFrame: 0,
            levels: 1
        });

        const frame = response.stackFrames?.[0] as
            | { line?: number; source?: { path?: string } }
            | undefined;

        if (!frame?.source?.path || frame.line === undefined) {
            return { shouldCapture: false };
        }

        const framePath = frame.source.path;
        const keys = captureSiteKeysForPath(framePath, frame.line);

        for (const key of keys) {
            if (this.plannedSites.has(key)) {
                return { shouldCapture: true, frameKey: key };
            }
        }

        const canonical = captureSiteKey(framePath, frame.line);
        if (this.plannedSites.has(canonical)) {
            return { shouldCapture: true, frameKey: canonical };
        }

        return { shouldCapture: false, frameKey: keys[0] };
    }

    private async safeContinue(threadId: number, context: string): Promise<void> {
        if (this.debugSession !== vscode.debug.activeDebugSession) {
            return;
        }

        try {
            await this.debugSession.customRequest('continue', { threadId });
            pbLog(`Continued (${context})`);
        } catch (err) {
            pbLog(`Continue skipped (${context}): ${err}`);
        }
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables.length = 0;
        this.tracker.dispose();
    }
}
