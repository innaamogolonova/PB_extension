import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Resolve PB trace entry point for an observed debug session.
 * Priority: launch config program → active editor → workspace folder (warn).
 */
export function resolveEntryPoint(
    session: vscode.DebugSession,
    activeEditor?: vscode.TextEditor
): string {
    const program = session.configuration?.program;
    if (typeof program === 'string' && program.length > 0) {
        return path.normalize(program);
    }

    const editor = activeEditor ?? vscode.window.activeTextEditor;
    if (editor?.document.uri.scheme === 'file') {
        const editorPath = editor.document.uri.fsPath;
        if (editorPath.endsWith('.py') || editorPath.endsWith('.pyw')) {
            return path.normalize(editorPath);
        }
    }

    const folder = vscode.workspace.workspaceFolders?.[0];
    if (folder) {
        console.warn('[resolveEntryPoint] No program or Python editor; using workspace folder as entry point');
        return path.normalize(folder.uri.fsPath);
    }

    throw new Error('Cannot resolve entry point for PB trace session');
}
