import { ExecutionTrace, LineValueState } from '../types';
import { TraceManager } from './TraceManager';

/**
 * Build legacy ExecutionTrace shape from an active TraceManager session (owned / test runs).
 */
export function executionTraceFromSession(
    traceManager: TraceManager,
    sessionId: string,
    preferredFilePath?: string
): ExecutionTrace {
    const session = traceManager.getSession(sessionId);
    if (!session) {
        throw new Error(`Trace session not found: ${sessionId}`);
    }

    const entryPath = preferredFilePath ?? session.entryPoint;
    const fileTrace =
        traceManager.findFileTrace(entryPath, sessionId) ??
        session.files.get(entryPath) ??
        Array.from(session.files.values())[0];

    const lineStates = new Map<number, LineValueState[]>();
    if (fileTrace) {
        for (const [lineNumber, states] of fileTrace.lineStates) {
            lineStates.set(
                lineNumber,
                states.map((state) => ({
                    lineNumber: state.lineNumber,
                    variables: state.variables,
                    timestamp: state.timestamp
                }))
            );
        }
    }

    return {
        filePath: fileTrace?.filePath ?? entryPath,
        language: session.language,
        lineStates,
        executionStart: session.executionStart,
        executionEnd: session.executionEnd ?? new Date(),
        success: session.success,
        error: session.error
    };
}
