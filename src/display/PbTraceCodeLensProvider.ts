import * as vscode from 'vscode';
import { formatInlineTraceSummary } from './formatTraceMarkdown';
import { TraceManager } from '../tracking/TraceManager';

/**
 * CodeLens on lines with PB captures — reliable full trace when debugger hover dominates.
 */
export class PbTraceCodeLensProvider implements vscode.CodeLensProvider {
    private readonly traceManager: TraceManager;
    private readonly onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
    readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;

    constructor(traceManager: TraceManager) {
        this.traceManager = traceManager;
    }

    public refresh(): void {
        this.onDidChangeCodeLensesEmitter.fire();
    }

    public provideCodeLenses(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken
    ): vscode.CodeLens[] {
        const fileTrace = this.traceManager.findFileTrace(document.uri.fsPath);
        if (!fileTrace) {
            return [];
        }

        const lenses: vscode.CodeLens[] = [];

        for (const lineNumber of fileTrace.lineStates.keys()) {
            const variables = this.traceManager.getLatestForFileLine(document.uri.fsPath, lineNumber);
            if (variables.length === 0) {
                continue;
            }

            const summary = formatInlineTraceSummary(variables, 2);
            const title = summary
                ? `$(debug) PB: ${summary} — click for full trace`
                : `$(debug) PB: ${variables.length} vars — click for full trace`;

            const range = new vscode.Range(lineNumber - 1, 0, lineNumber - 1, 0);
            lenses.push(
                new vscode.CodeLens(range, {
                    title,
                    command: 'pbExtension.showLineTrace',
                    arguments: [document.uri.toString(), lineNumber]
                })
            );
        }

        return lenses;
    }
}
