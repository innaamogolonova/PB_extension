import * as vscode from 'vscode';
import { astCaptureSiteProvider } from './AstCaptureSiteProvider';
import { CaptureSite, sitesToLines } from './captureSites';
/**
 * Capture-site detection for Python (Phase 3.5: AST with regex fallback).
 */
export class CriticalPointDetector {
    public async detectCaptureSites(document: vscode.TextDocument): Promise<CaptureSite[]> {
        if (document.languageId !== 'python' && !document.uri.fsPath.endsWith('.py')) {
            return [];
        }

        return astCaptureSiteProvider.detectCaptureSites(document);
    }

    public async detectCriticalLines(document: vscode.TextDocument): Promise<number[]> {
        const sites = await this.detectCaptureSites(document);
        return sitesToLines(sites);
    }
}
