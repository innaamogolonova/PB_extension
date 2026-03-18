import * as vscode from 'vscode';
import { TraceManager } from '../tracking/TraceManager';

export class FullTraceHoverProvider implements vscode.HoverProvider {
    private traceManager: TraceManager;

    constructor(traceManager: TraceManager) {
        this.traceManager = traceManager;
    }

    public async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        const trace = this.traceManager.getFullTrace();
        if (!trace || document.uri.fsPath !== trace.filePath) {
            return undefined;
        }

        const lineNumber = position.line + 1;
        const allVariables = this.traceManager.getVariablesForLine(lineNumber);

        if (allVariables.length === 0) {
            return undefined;
        }

        const markdown = new vscode.MarkdownString();
        markdown.appendMarkdown('**Full Trace Variables**\n\n');

        for (const variable of allVariables) {
            markdown.appendMarkdown(`- \`${variable.name}\`: **${variable.value}** _(${variable.type})_\n`);
        }

        markdown.appendMarkdown('\n---\n');
        markdown.appendMarkdown(`_Showing ${allVariables.length} variable${allVariables.length === 1 ? '' : 's'}_`);

        return new vscode.Hover(markdown);
    }
}