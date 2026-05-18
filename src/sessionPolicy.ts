import * as path from 'path';
import * as vscode from 'vscode';
import { getCaptureMode } from './config';
import { PbCaptureMode, PbSessionPolicy, PbSessionRole } from './types';

/** Debug adapters PB may attach to (python = legacy, debugpy = current). */
export const PB_SUPPORTED_DEBUG_TYPES = ['python', 'debugpy'] as const;

const ownedDebugSessionIds = new Set<string>();

/**
 * Session ownership policy (Phase 0 — documentation + helpers only):
 *
 * - **Owned:** PB called `startDebugging` (e.g. Test Debug Executor). Always trace when PB starts the run.
 * - **Observed:** User started debugging (F5 / launch.json). Trace only when tracing is explicitly enabled
 *   and the session is a supported type in the workspace.
 */
export function registerOwnedDebugSession(debugSessionId: string): void {
    ownedDebugSessionIds.add(debugSessionId);
}

export function unregisterOwnedDebugSession(debugSessionId: string): void {
    ownedDebugSessionIds.delete(debugSessionId);
}

export function isOwnedDebugSession(debugSessionId: string): boolean {
    return ownedDebugSessionIds.has(debugSessionId);
}

export function getSessionRole(
    session: vscode.DebugSession,
    tracingEnabled: boolean
): PbSessionRole | undefined {
    if (isOwnedDebugSession(session.id)) {
        return 'owned';
    }
    if (shouldObserveSession(session, tracingEnabled)) {
        return 'observed';
    }
    return undefined;
}

export function shouldObserveSession(
    session: vscode.DebugSession,
    tracingEnabled: boolean
): boolean {
    if (!tracingEnabled) {
        return false;
    }
    if (!isSupportedDebugType(session.type)) {
        return false;
    }
    return isSessionInWorkspace(session);
}

/** Human-readable reason when an observed session is not handled (for diagnostics). */
export function getSessionIgnoreReason(
    session: vscode.DebugSession,
    tracingEnabled: boolean
): string | undefined {
    if (!tracingEnabled) {
        return 'PB tracing is off. Run "PB Extension: Start Tracing" or "Debug Python File with Tracing" first.';
    }
    if (isOwnedDebugSession(session.id)) {
        return 'Session owned by PB Run (exhaustive mode; orchestrator does not attach).';
    }
    if (!isSupportedDebugType(session.type)) {
        return (
            `Unsupported debug type "${session.type}". ` +
            'F5 may be running "Run Extension" instead of a Python config. ' +
            'Use Run and Debug → "Python: Current File", or command "PB Extension: Debug Python File with Tracing".'
        );
    }
    if (!isSessionInWorkspace(session)) {
        return 'Debug program is outside the open workspace folder.';
    }
    return undefined;
}

export function createPbSessionPolicy(
    session: vscode.DebugSession,
    role: PbSessionRole,
    captureMode?: PbCaptureMode
): PbSessionPolicy {
    return {
        role,
        captureMode: captureMode ?? getCaptureMode(),
        debugSessionId: session.id
    };
}

function isSupportedDebugType(debugType: string): boolean {
    return (PB_SUPPORTED_DEBUG_TYPES as readonly string[]).includes(debugType);
}

function isSessionInWorkspace(session: vscode.DebugSession): boolean {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        return false;
    }

    const program = session.configuration?.program as string | undefined;
    if (!program || typeof program !== 'string') {
        // No program path (e.g. attach configs): allow if any workspace folder is open.
        return true;
    }

    const normalizedProgram = path.normalize(program);
    return folders.some((folder) => {
        const root = path.normalize(folder.uri.fsPath);
        return normalizedProgram === root || normalizedProgram.startsWith(root + path.sep);
    });
}
