// Limitations: only for Python, regex based for now 
// TODO: add more patterns (maybe), make it smarter (e.g. use AST parsing instead of regex), support more languages

import * as vscode from 'vscode';

export class CriticalPointDetector {
    public detectCriticalLines(document: vscode.TextDocument): number[] {
        const criticalLines: number[] = [];

        for (let i = 0; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text.trim();

            if (/^#/.test(lineText)) {
                continue;
            }

            if (
                /^return(\s+|$)/.test(lineText) ||
                /^\w+\s*=\s*\w+\(/.test(lineText)
            ) {
                criticalLines.push(i + 1);
            }
        }

        return criticalLines;
    }
}