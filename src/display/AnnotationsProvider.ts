import * as vscode from 'vscode';
import { pbLog } from '../pbOutput';
import { TraceManager } from '../tracking/TraceManager';
import { CriticalPointDetector } from '../analysis/CriticalPointDetector';
import { LLMFilterService } from '../services/LLMFilterService';
import { VariableInfo } from '../types';
import { formatInlineTraceSummary } from './formatTraceMarkdown';

export class AnnotationsProvider {
    private decorationsType: vscode.TextEditorDecorationType;
    private traceManager: TraceManager;
    private criticalPointDetector: CriticalPointDetector;
    private llmService?: LLMFilterService;
    private static readonly MAX_ANNOTATION_LENGTH = 120;

    constructor(traceManager: TraceManager, llmService?: LLMFilterService) {
        this.traceManager = traceManager;
        this.criticalPointDetector = new CriticalPointDetector();
        this.llmService = llmService;

        this.decorationsType = vscode.window.createTextEditorDecorationType({
            after: {
                color: new vscode.ThemeColor('editorLightBulb.foreground'),
                fontStyle: 'italic',
                margin: '0 0 0 3ch',
                textDecoration: 'none'
            }
        });
    }

    public async applyAnnotations(editor: vscode.TextEditor): Promise<void> {
        const filePath = editor.document.uri.fsPath;
        this.traceManager.setActiveFilePath(filePath);

        const fileTrace = this.traceManager.findFileTrace(filePath);
        if (!fileTrace) {
            editor.setDecorations(this.decorationsType, []);
            return;
        }

        const config = vscode.workspace.getConfiguration('pbExtension');
        const llmEnabled = config.get<boolean>('llmFilteringEnabled', true) && !!this.llmService;

        const tracedLines = this.traceManager.getTracedLineNumbers(filePath);
        const criticalLines = this.criticalPointDetector.detectCriticalLines(editor.document);
        const linesToDecorate = Array.from(new Set([...tracedLines, ...criticalLines])).sort(
            (a, b) => a - b
        );

        const lineData = linesToDecorate
            .map((line) => ({
                line,
                variables: this.traceManager.getLatestForFileLine(filePath, line),
                lineCode: editor.document.lineAt(line - 1).text.trim()
            }))
            .filter((entry) => entry.variables.length > 0);

        if (lineData.length === 0) {
            editor.setDecorations(this.decorationsType, []);
            pbLog(`Annotations: no variable data for ${filePath} (${tracedLines.length} traced lines)`);
            return;
        }

        const filteredByLine = new Map<number, VariableInfo[]>();

        if (llmEnabled) {
            const filterPromises = lineData.map(async (entry) => {
                const semanticContext = this.buildSemanticContext(editor.document, entry.line);
                const relevant = await this.llmService!.getRelevantVariables(
                    entry.line,
                    entry.lineCode,
                    entry.variables,
                    semanticContext
                );
                return { line: entry.line, relevant, fallback: entry.variables };
            });

            const results = await Promise.all(filterPromises);
            for (const result of results) {
                const picked =
                    result.relevant.length > 0
                        ? result.relevant
                        : result.fallback.slice(0, 3);
                filteredByLine.set(result.line, picked);
            }
        }

        const decorations: vscode.DecorationOptions[] = [];

        for (const entry of lineData) {
            const variablesToShow = llmEnabled
                ? (filteredByLine.get(entry.line) ?? entry.variables.slice(0, 3))
                : entry.variables.slice(0, 4);

            if (variablesToShow.length === 0) {
                continue;
            }

            const annotationText = this.formatAnnotationText(variablesToShow);
            const lineText = editor.document.lineAt(entry.line - 1);
            const range = new vscode.Range(
                entry.line - 1,
                lineText.text.length,
                entry.line - 1,
                lineText.text.length
            );

            decorations.push({
                range,
                renderOptions: { after: { contentText: annotationText } }
            });
        }

        editor.setDecorations(this.decorationsType, decorations);
        pbLog(`Annotations: ${decorations.length} line(s) decorated in ${filePath}`);
    }

    public clear(editor: vscode.TextEditor): void {
        editor.setDecorations(this.decorationsType, []);
    }

    public dispose(): void {
        this.decorationsType.dispose();
    }

    private formatAnnotationText(variables: VariableInfo[]): string {
        const summary = formatInlineTraceSummary(variables, 4);
        if (!summary) {
            return '';
        }
        const text = ` ⟨PB⟩ ${summary}`;
        if (text.length <= AnnotationsProvider.MAX_ANNOTATION_LENGTH) {
            return text;
        }
        return `${text.slice(0, AnnotationsProvider.MAX_ANNOTATION_LENGTH - 1)}…`;
    }

    private buildSemanticContext(document: vscode.TextDocument, lineNumber: number): string {
        const index = lineNumber - 1;
        const start = Math.max(0, index - 3);
        const end = Math.min(document.lineCount - 1, index + 2);

        let nearestSymbol = '';
        for (let i = index; i >= 0; i--) {
            const text = document.lineAt(i).text.trim();
            if (!text) {
                continue;
            }

            if (/^(def\s+\w+\s*\(|class\s+\w+\s*[:(])/.test(text)) {
                nearestSymbol = text;
                break;
            }
        }

        const nearbyLines: string[] = [];
        for (let i = start; i <= end; i++) {
            nearbyLines.push(`L${i + 1}: ${document.lineAt(i).text.trim()}`);
        }

        const relativePath = vscode.workspace.asRelativePath(document.uri, false);
        const symbolBlock = nearestSymbol ? `\nNearest function/class: ${nearestSymbol}` : '';

        return `File: ${relativePath}\nLanguage: ${document.languageId}${symbolBlock}\nNearby lines:\n${nearbyLines.join('\n')}`;
    }
}
