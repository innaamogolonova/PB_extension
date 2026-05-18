import * as vscode from 'vscode';
import { TraceManager } from '../tracking/TraceManager';
import { formatTraceHoverMarkdown } from './formatTraceMarkdown';

export class FullTraceHoverProvider implements vscode.HoverProvider {
    private readonly traceManager: TraceManager;

    constructor(traceManager: TraceManager) {
        this.traceManager = traceManager;
    }

    public provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Hover> {
        const filePath = document.uri.fsPath;
        this.traceManager.pinActiveSessionForFile(filePath);
        const lineNumber = position.line + 1;
        const allVariables = this.traceManager.getLatestForFileLine(filePath, lineNumber);

        if (allVariables.length === 0) {
            return undefined;
        }

        const debugging = vscode.debug.activeDebugSession !== undefined;
        const markdown = formatTraceHoverMarkdown(lineNumber, allVariables, {
            hint: debugging
                ? 'Debugger hover may cover this — stop debugging or use CodeLens "PB trace" on the line.'
                : undefined
        });

        const lineRange = document.lineAt(position.line).range;
        return new vscode.Hover(markdown, lineRange);
    }
}
