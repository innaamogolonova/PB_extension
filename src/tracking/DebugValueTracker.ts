/**
 * DebugValueTracker is responsible for tracking variable values during a debug session in an event-driven manner.
*/

import * as path from 'path';
import * as vscode from 'vscode';
import { ExecutionTrace, LineValueState, VariableInfo } from '../types';
import { TraceManager } from './TraceManager';
import { IValueTracker } from './IValueTracker';

interface StackFrameInfo {
    id: number;
    line: number;
    name?: string;
    sourcePath?: string;
}

export class DebugValueTracker implements IValueTracker {
    private languageId: string;
    private sessionId: string;
    private entryPoint: string;
    private traceManager: TraceManager;
    private currentSession?: vscode.DebugSession;
    private disposables: vscode.Disposable[];
    private executionStart: Date;
    private executionEnd?: Date;
    private isTracking: boolean;
    private lastError?: string;

    constructor(languageId: string, sessionId: string, traceManager: TraceManager, entryPoint: string) {
        this.languageId = languageId;
        this.sessionId = sessionId;
        this.traceManager = traceManager;
        this.entryPoint = path.normalize(entryPoint);
        this.disposables = [];
        this.isTracking = false;
        this.executionStart = new Date();

        console.log(`[DebugValueTracker] Created for session ${sessionId}`);
    }

    public bindDebugSession(session: vscode.DebugSession): void {
        this.currentSession = session;
    }

    public startTracking(session: vscode.DebugSession): void {
        this.bindDebugSession(session);
        this.isTracking = true;

        const disposable = vscode.debug.onDidReceiveDebugSessionCustomEvent((event) => {
            if (event.session.id === this.currentSession?.id && event.event === 'stopped') {
                void this.captureVariablesAtStop(event);
            }
        });

        this.disposables.push(disposable);

        console.log(`[DebugValueTracker] Started tracking session: ${session.id}`);
    }

    private async captureVariablesAtStop(event: vscode.DebugSessionCustomEvent): Promise<void> {
        try {
            const threadId = event.body.threadId as number;
            await this.captureFromThread(threadId);
        } catch (err) {
            const errorMsg = `Failed to capture variables: ${err}`;
            console.error(`[DebugValueTracker] ${errorMsg}`);
            this.lastError = errorMsg;
        }
    }

    private async getStackFrames(threadId: number, levels: number = 20): Promise<StackFrameInfo[]> {
        if (!this.currentSession) {
            throw new Error('getStackFrames: No active debug session');
        }

        const response = await this.currentSession.customRequest('stackTrace', {
            threadId,
            startFrame: 0,
            levels
        });

        const stackFrames = response.stackFrames as Array<{
            id: number;
            line: number;
            name?: string;
            source?: { path?: string };
        }>;

        return stackFrames.map((frame) => ({
            id: frame.id,
            line: frame.line,
            name: frame.name,
            sourcePath: frame.source?.path
        }));
    }

    private async getScopes(frameId: number): Promise<Array<{ name: string; variablesReference: number }>> {
        if (!this.currentSession) {
            throw new Error('getScopes: No active debug session');
        }

        const response = await this.currentSession.customRequest('scopes', { frameId });
        return response.scopes as Array<{ name: string; variablesReference: number }>;
    }

    private async getVariablesInScope(scope: { name: string; variablesReference: number }): Promise<VariableInfo[]> {
        if (!this.currentSession) {
            throw new Error('getVariablesInScope: No active debug session');
        }

        const response = await this.currentSession.customRequest('variables', {
            variablesReference: scope.variablesReference
        });

        const variables: VariableInfo[] = [];
        for (const variable of response.variables as Array<{
            name: string;
            value: string;
            type: string;
            presentationHint?: { kind?: string };
        }>) {
            if (
                variable.name === 'special variables' ||
                variable.name === 'function variables' ||
                variable.name === 'class variables' ||
                variable.name.startsWith('__') ||
                variable.presentationHint?.kind === 'virtual'
            ) {
                continue;
            }

            variables.push({
                name: variable.name,
                value: variable.value,
                type: variable.type
            });
        }

        return variables;
    }

    public async captureFromThread(threadId: number): Promise<void> {
        const stackFrames = await this.getStackFrames(threadId);
        if (stackFrames.length === 0) {
            return;
        }

        for (const frame of stackFrames) {
            if (!frame.sourcePath) {
                continue;
            }

            const normalizedPath = path.normalize(frame.sourcePath);
            const scopes = await this.getScopes(frame.id);
            const allVariables: VariableInfo[] = [];

            for (const scope of scopes) {
                if (scope.name === 'Locals' || scope.name === 'locals') {
                    const variables = await this.getVariablesInScope(scope);
                    allVariables.push(...variables);
                }
            }

            this.traceManager.appendState(
                this.sessionId,
                normalizedPath,
                frame.line,
                allVariables,
                {
                    frameId: frame.id,
                    threadId,
                    functionName: frame.name
                }
            );
        }
    }

    public async captureAtCurrentPosition(threadId: number): Promise<void> {
        try {
            await this.captureFromThread(threadId);
        } catch (err) {
            const errorMsg = `Failed to capture variables: ${err}`;
            console.error(`[DebugValueTracker] ${errorMsg}`);
            this.lastError = errorMsg;
        }
    }

    public stopTracking(): void {
        this.isTracking = false;

        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];

        if (this.executionEnd === undefined) {
            this.executionEnd = new Date();
        }

        this.currentSession = undefined;

        console.log('[DebugValueTracker] Stopped tracking');
    }

    public getTrace(): ExecutionTrace {
        this.executionEnd = new Date();

        const session = this.traceManager.getSession(this.sessionId);
        const entryFileTrace = session?.files.get(this.entryPoint);
        const fallbackFileTrace = entryFileTrace ?? (session ? Array.from(session.files.values())[0] : undefined);

        const map = new Map<number, LineValueState[]>();
        if (fallbackFileTrace) {
            for (const [lineNumber, states] of fallbackFileTrace.lineStates) {
                map.set(
                    lineNumber,
                    states.map((state) => ({
                        lineNumber: state.lineNumber,
                        variables: state.variables,
                        timestamp: state.timestamp
                    }))
                );
            }
        }

        const success = this.lastError === undefined;

        return {
            filePath: fallbackFileTrace?.filePath ?? this.entryPoint,
            language: this.languageId,
            lineStates: map,
            executionStart: this.executionStart,
            executionEnd: this.executionEnd,
            success,
            error: this.lastError
        };
    }

    public clear(): void {
        this.executionStart = new Date();
        this.executionEnd = undefined;
        this.lastError = undefined;

        console.log('[DebugValueTracker] Cleared tracker state');
    }

    public dispose(): void {
        this.stopTracking();
    }
}
