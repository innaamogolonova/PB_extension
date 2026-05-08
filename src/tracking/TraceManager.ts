import { ExecutionTrace, FileTrace, LineValueState, TraceSession, VariableInfo } from "../types";

interface FrameMetadata {
    frameId: number;
    threadId: number;
    functionName?: string;
}

export class TraceManager {
    private sessions: Map<string, TraceSession> = new Map();
    private activeSessionId?: string;
    private activeFilePath?: string;

    public createSession(entryPoint: string, language: string): string {
        const sessionId = `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const session: TraceSession = {
            sessionId,
            entryPoint,
            language,
            files: new Map<string, FileTrace>(),
            executionStart: new Date(),
            success: true
        };

        this.sessions.set(sessionId, session);
        this.activeSessionId = sessionId;
        this.activeFilePath = entryPoint;

        return sessionId;
    }

    public setActiveSession(sessionId: string): void {
        if (!this.sessions.has(sessionId)) {
            throw new Error(`Unknown session id: ${sessionId}`);
        }
        this.activeSessionId = sessionId;
    }

    public setActiveFilePath(filePath: string): void {
        this.activeFilePath = filePath;
    }

    public appendState(
        sessionId: string,
        filePath: string,
        lineNumber: number,
        variables: VariableInfo[],
        metadata: FrameMetadata
    ): void {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Cannot append state, session not found: ${sessionId}`);
        }

        const fileTrace = session.files.get(filePath) ?? {
            filePath,
            language: session.language,
            lineStates: new Map(),
            capturedAt: Date.now(),
            isStale: false
        };

        const lineStates = fileTrace.lineStates.get(lineNumber) ?? [];
        lineStates.push({
            lineNumber,
            variables,
            timestamp: Date.now(),
            frameFilePath: filePath,
            frameId: metadata.frameId,
            threadId: metadata.threadId,
            functionName: metadata.functionName
        });

        fileTrace.lineStates.set(lineNumber, lineStates);
        fileTrace.capturedAt = Date.now();

        session.files.set(filePath, fileTrace);
        this.activeSessionId = sessionId;
        this.activeFilePath = filePath;
    }

    public getLatestForFileLine(filePath: string, lineNumber: number, sessionId?: string): VariableInfo[] {
        const fileTrace = this.getFileTrace(filePath, sessionId);
        if (!fileTrace) {
            return [];
        }

        const states = fileTrace.lineStates.get(lineNumber);
        if (!states || states.length === 0) {
            return [];
        }

        return states[states.length - 1].variables;
    }

    public getFileTrace(filePath: string, sessionId?: string): FileTrace | undefined {
        const session = this.resolveSession(sessionId);
        if (!session) {
            return undefined;
        }

        return session.files.get(filePath);
    }

    public markFileStale(filePath: string, sessionId?: string): void {
        const session = this.resolveSession(sessionId);
        if (!session) {
            return;
        }

        const fileTrace = session.files.get(filePath);
        if (!fileTrace) {
            return;
        }

        fileTrace.isStale = true;
        fileTrace.capturedAt = Date.now();
        session.files.set(filePath, fileTrace);
    }

    public finalizeSession(sessionId: string, result: { success: boolean; error?: string }): void {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Cannot finalize, session not found: ${sessionId}`);
        }

        session.executionEnd = new Date();
        session.success = result.success;
        session.error = result.error;
        this.sessions.set(sessionId, session);
    }

    public getCurrentSession(): TraceSession | undefined {
        return this.resolveSession();
    }

    public getSession(sessionId: string): TraceSession | undefined {
        return this.sessions.get(sessionId);
    }

    // Compatibility API
    public setTrace(trace: ExecutionTrace): void {
        const sessionId = this.createSession(trace.filePath, trace.language);

        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error('Failed to create compatibility session');
        }

        const fileTrace: FileTrace = {
            filePath: trace.filePath,
            language: trace.language,
            lineStates: new Map(),
            capturedAt: Date.now(),
            isStale: false
        };

        for (const [lineNumber, states] of trace.lineStates) {
            const capturedStates = states.map((state) => ({
                ...state,
                frameFilePath: trace.filePath,
                frameId: 0,
                threadId: 0
            }));
            fileTrace.lineStates.set(lineNumber, capturedStates);
        }

        session.files.set(trace.filePath, fileTrace);
        session.executionStart = trace.executionStart;
        session.executionEnd = trace.executionEnd;
        session.success = trace.success;
        session.error = trace.error;

        this.sessions.set(sessionId, session);
        this.activeSessionId = sessionId;
        this.activeFilePath = trace.filePath;
    }

    public getVariablesForLine(lineNumber: number, filePath?: string, sessionId?: string): VariableInfo[] {
        const targetFilePath = filePath ?? this.activeFilePath;
        if (!targetFilePath) {
            return [];
        }

        return this.getLatestForFileLine(targetFilePath, lineNumber, sessionId);
    }

    public getCriticalPoints(filePath?: string, sessionId?: string): number[] {
        const targetFilePath = filePath ?? this.activeFilePath;
        if (!targetFilePath) {
            return [];
        }

        const fileTrace = this.getFileTrace(targetFilePath, sessionId);
        if (!fileTrace) {
            return [];
        }

        return Array.from(fileTrace.lineStates.keys());
    }

    public getFullTrace(): ExecutionTrace | undefined {
        const session = this.resolveSession();
        if (!session) {
            return undefined;
        }

        const targetFilePath = this.activeFilePath ?? session.entryPoint;
        const fileTrace = session.files.get(targetFilePath) ?? session.files.get(session.entryPoint);
        if (!fileTrace) {
            return undefined;
        }

        const legacyLineStates = new Map<number, LineValueState[]>();
        for (const [lineNumber, states] of fileTrace.lineStates) {
            legacyLineStates.set(
                lineNumber,
                states.map((state) => ({
                    lineNumber: state.lineNumber,
                    variables: state.variables,
                    timestamp: state.timestamp
                }))
            );
        }

        return {
            filePath: fileTrace.filePath,
            language: fileTrace.language,
            lineStates: legacyLineStates,
            executionStart: session.executionStart,
            executionEnd: session.executionEnd,
            success: session.success,
            error: session.error
        };
    }

    public clear(): void {
        this.sessions.clear();
        this.activeSessionId = undefined;
        this.activeFilePath = undefined;
    }

    private resolveSession(sessionId?: string): TraceSession | undefined {
        const targetSessionId = sessionId ?? this.activeSessionId;
        if (!targetSessionId) {
            return undefined;
        }

        return this.sessions.get(targetSessionId);
    }
}
