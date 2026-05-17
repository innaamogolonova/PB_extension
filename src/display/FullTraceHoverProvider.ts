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
    ): vscode.Hover | undefined {
        this.traceManager.setActiveFilePath(document.uri.fsPath);
        const lineNumber = position.line + 1;
        const allVariables = this.traceManager.getLatestForFileLine(document.uri.fsPath, lineNumber);

        if (allVariables.length === 0) {
            return undefined;
        }

        const markdown = formatTraceHoverMarkdown(lineNumber, allVariables, {
            hint:
                'While debugging, the debugger hover may appear first — use CodeLens "PB trace" above the line, or stop debugging to see this hover.'
        });

        const lineRange = document.lineAt(position.line).range;
        return new vscode.Hover(markdown, lineRange);
    }
}
