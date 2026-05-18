import * as vscode from 'vscode';

/**
 * Resolves when the given VS Code debug session terminates.
 */
export function waitForDebugSessionEnd(debugSessionId: string): Promise<void> {
    return new Promise((resolve) => {
        const disposable = vscode.debug.onDidTerminateDebugSession((session) => {
            if (session.id === debugSessionId) {
                disposable.dispose();
                resolve();
            }
        });
    });
}
