import * as vscode from 'vscode';
import { CaptureSite } from './captureSites';

/**
 * Legacy regex detector (Phase 2). Used as fallback when AST parse fails or config is regex-only.
 */
export function detectRegexCaptureSites(document: vscode.TextDocument): CaptureSite[] {
    const sites: CaptureSite[] = [];

    for (let i = 0; i < document.lineCount; i++) {
        const lineText = document.lineAt(i).text.trim();
        const line = i + 1;

        if (/^#/.test(lineText)) {
            continue;
        }

        if (/^return(\s+|$)/.test(lineText)) {
            sites.push({ line, kind: 'return' });
            continue;
        }

        if (/^\w+\s*=\s*\w+\(/.test(lineText)) {
            sites.push({ line, kind: 'assign' });
        }
    }

    return sites;
}
