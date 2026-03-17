import * as vscode from 'vscode';
import { TraceManager } from '../tracking/TraceManager';
import { CriticalPointDetector } from '../analysis/CriticalPointDetector';

export class AnnotationsProvider {
    private decorationsType: vscode.TextEditorDecorationType;
    private traceManager: TraceManager;
    private criticalPointDetector: CriticalPointDetector; 

    constructor(traceManager: TraceManager) {
        this.traceManager = traceManager;
        this.criticalPointDetector = new CriticalPointDetector();
        
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

        const criticalLines = this.criticalPointDetector.detectCriticalLines(editor.document);
        const decorations: vscode.DecorationOptions[] = [];

        for (const line of criticalLines) {
            const variables = this.traceManager.getVariablesForLine(line);

            if (variables.length > 0) {

                // TODO: maybe remove the dot? idk if its needed or if it looks better without it
                const annotationText = ' • ' + variables.map(v => `${v.name}=${v.value}`).join(', ');
                
                const lineText = editor.document.lineAt(line - 1);
                const range = new vscode.Range(line - 1, lineText.text.length, line - 1, lineText.text.length);
                
                decorations.push({ range, renderOptions: { after: { contentText: annotationText } } });
            }
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