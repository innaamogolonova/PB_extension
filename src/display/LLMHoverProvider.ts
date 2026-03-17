import * as vscode from 'vscode';
import { TraceManager } from '../tracking/TraceManager';
import { LLMFilterService } from '../services/LLMFilterService';

export class LLMHoverProvider implements vscode.HoverProvider {
    private traceManager: TraceManager;
    private llmService: LLMFilterService;

    constructor(traceManager: TraceManager, llmService: LLMFilterService) {
        this.traceManager = traceManager;
        this.llmService = llmService;
    }

    public async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        const config = vscode.workspace.getConfiguration('pbExtension');
        const llmEnabled = config.get<boolean>('llmFilteringEnabled', true);

        if (!llmEnabled) {
            return undefined;
        }

        const trace = this.traceManager.getFullTrace();
        if (!trace || document.uri.fsPath !== trace.filePath) {
            return undefined;
        }

        const lineNumber = position.line + 1;
        const allVariables = this.traceManager.getVariablesForLine(lineNumber);

        if (allVariables.length === 0) {
            return undefined;
        }

        const lineCode = document.lineAt(position.line).text.trim();

        const contextLines: string[] = [];
        const contextStart = Math.max(0, position.line - 2);
        const contextEnd = Math.min(document.lineCount - 1, position.line + 2);

        for (let i = contextStart; i <= contextEnd; i++) {
            contextLines.push(`${i + 1}: ${document.lineAt(i).text}`);
        }
        const context = contextLines.join('\n');

        const relevantVars = await this.llmService.getRelevantVariables(
            lineNumber,
            lineCode,
            allVariables,
            context
        );

        if (relevantVars.length === 0) {
            return undefined;
        }

        const markdown = new vscode.MarkdownString();
        markdown.appendMarkdown('**🤖 LLM-Filtered Variables**\n\n');

        for (const variable of relevantVars) {
            markdown.appendMarkdown(`- \`${variable.name}\`: **${variable.value}** _(${variable.type})_\n`);
        }

        markdown.appendMarkdown('\n---\n');
        markdown.appendMarkdown(`_Showing ${relevantVars.length} of ${allVariables.length} variables_`);

        return new vscode.Hover(markdown);
    }
}
