import * as vscode from 'vscode';
import { TraceManager } from '../tracking/TraceManager';
import { CriticalPointDetector } from '../analysis/CriticalPointDetector';
import { LLMFilterService } from '../services/LLMFilterService';
import { VariableInfo } from '../types';

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
                color: new vscode.ThemeColor('editorCodeLens.foreground'),
                margin: '0 0 0 2em',
                textDecoration: 'none; opacity: 0.6'
            }
        });
    }

    public async applyAnnotations(editor: vscode.TextEditor): Promise<void> {
        const trace = this.traceManager.getFullTrace();
        if (!trace) {
            return;
        }

        const config = vscode.workspace.getConfiguration('pbExtension');
        const llmEnabled = config.get<boolean>('llmFilteringEnabled', true);

        const criticalLines = this.criticalPointDetector.detectCriticalLines(editor.document);
        const decorations: vscode.DecorationOptions[] = [];

        const lineData = criticalLines
            .map((line) => ({
                line,
                variables: this.traceManager.getVariablesForLine(line),
                lineCode: editor.document.lineAt(line - 1).text.trim()
            }))
            .filter((entry) => entry.variables.length > 0);

        if (lineData.length === 0) {
            editor.setDecorations(this.decorationsType, decorations);
            return;
        }

        const filteredByLine = new Map<number, VariableInfo[]>();

        if (llmEnabled && this.llmService) {
            const filterPromises = lineData.map(async (entry) => {
                const semanticContext = this.buildSemanticContext(editor.document, entry.line);
                const relevant = await this.llmService!.getRelevantVariables(
                    entry.line,
                    entry.lineCode,
                    entry.variables,
                    semanticContext
                );
                return { line: entry.line, relevant };
            });

            const results = await Promise.all(filterPromises);
            for (const result of results) {
                filteredByLine.set(result.line, result.relevant);
            }
        }

        for (const entry of lineData) {
            const variablesToShow =
                llmEnabled && this.llmService
                    ? (filteredByLine.get(entry.line) ?? [])
                    : entry.variables;

            if (variablesToShow.length === 0) {
                continue;
            }

            const annotationText = this.formatAnnotationText(variablesToShow);
            const lineText = editor.document.lineAt(entry.line - 1);
            const range = new vscode.Range(entry.line - 1, lineText.text.length, entry.line - 1, lineText.text.length);

            decorations.push({ range, renderOptions: { after: { contentText: annotationText } } });
        }

        editor.setDecorations(this.decorationsType, decorations);
    }

    public clear(editor: vscode.TextEditor): void {
        editor.setDecorations(this.decorationsType, []);
    }

    public dispose(): void {
        this.decorationsType.dispose();
    }

    private formatAnnotationText(variables: VariableInfo[]): string {
        const parts = variables.map((variable) => `${variable.name}=${variable.value}`);
        const result: string[] = [];
        let usedLength = 3;

        for (const part of parts) {
            const separator = result.length > 0 ? 2 : 0;
            const nextLength = usedLength + separator + part.length;

            if (nextLength <= AnnotationsProvider.MAX_ANNOTATION_LENGTH) {
                result.push(part);
                usedLength = nextLength;
                continue;
            }

            const remaining = AnnotationsProvider.MAX_ANNOTATION_LENGTH - usedLength - separator;
            if (remaining > 4) {
                result.push(`${part.slice(0, remaining - 1)}…`);
            }
            break;
        }

        return ` • ${result.join(', ')}`;
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

            if (/^(def\s+\w+\s*\(|class\s+\w+\s*[:(]|function\s+\w+\s*\(|\w+\s*\([^)]*\)\s*\{)/.test(text)) {
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