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
                const relevant = await this.llmService!.getRelevantVariables(
                    entry.line,
                    entry.lineCode,
                    entry.variables
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

            const annotationText = ' • ' + variablesToShow.map(v => `${v.name}=${v.value}`).join(', ');
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
}