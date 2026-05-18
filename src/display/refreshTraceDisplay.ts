import * as vscode from 'vscode';
import { normalizeSourcePath } from '../orchestration/pathUtils';
import { TraceManager } from '../tracking/TraceManager';
import { AnnotationsProvider } from './AnnotationsProvider';
import { PbTraceCodeLensProvider } from './PbTraceCodeLensProvider';

/**
 * Re-apply ghost text, CodeLens, and related UI for a traced file.
 */
export async function refreshTraceDisplay(
    traceManager: TraceManager,
    annotationsProvider: AnnotationsProvider,
    codeLensProvider: PbTraceCodeLensProvider | undefined,
    preferredFilePath?: string
): Promise<void> {
    const targetPath =
        preferredFilePath ?? traceManager.getCurrentSession()?.entryPoint;

    if (!targetPath) {
        return;
    }

    const normalized = normalizeSourcePath(targetPath);
    let editor = vscode.window.visibleTextEditors.find(
        (e) => normalizeSourcePath(e.document.uri.fsPath) === normalized
    );

    if (!editor) {
        try {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(normalized));
            editor = await vscode.window.showTextDocument(doc, {
                preview: false,
                preserveFocus: true
            });
        } catch {
            return;
        }
    }

    traceManager.pinActiveSessionForFile(normalized);
    traceManager.setActiveFilePath(normalized);
    codeLensProvider?.refresh();
    await annotationsProvider.applyAnnotations(editor);
}
