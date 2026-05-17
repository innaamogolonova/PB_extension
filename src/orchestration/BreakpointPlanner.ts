import * as path from 'path';
import * as vscode from 'vscode';
import { CriticalPointDetector } from '../analysis/CriticalPointDetector';
import { pbLog } from '../pbOutput';
import { captureSiteKey, isExcludedTracePath, normalizeSourcePath } from './pathUtils';

export interface PlannedCaptureSite {
    uri: vscode.Uri;
    /** 1-based line number */
    line: number;
}

/**
 * M2 — Plans heuristic capture sites and manages PB-owned source breakpoints.
 */
export class BreakpointPlanner implements vscode.Disposable {
    private readonly detector = new CriticalPointDetector();
    private readonly pbBreakpoints: vscode.Breakpoint[] = [];
    private readonly plannedSites = new Set<string>();

    public getPlannedSites(): ReadonlySet<string> {
        return this.plannedSites;
    }

    /**
     * Entry file plus open Python editors in the workspace (skips venv/site-packages).
     */
    public async planSites(entryPoint: string): Promise<PlannedCaptureSite[]> {
        const sites: PlannedCaptureSite[] = [];
        const seenKeys = new Set<string>();
        const filePaths = this.collectFilePaths(entryPoint);

        for (const filePath of filePaths) {
            if (isExcludedTracePath(filePath)) {
                continue;
            }

            const document = await this.loadPythonDocument(filePath);
            if (!document) {
                continue;
            }

            const lines = this.detector.detectCriticalLines(document);
            const uri = vscode.Uri.file(normalizeSourcePath(filePath));

            for (const line of lines) {
                const key = captureSiteKey(filePath, line);
                if (seenKeys.has(key)) {
                    continue;
                }
                seenKeys.add(key);
                this.plannedSites.add(key);
                sites.push({ uri, line });
            }
        }

        pbLog(`BreakpointPlanner: ${sites.length} site(s) across ${filePaths.length} file(s)`);
        return sites;
    }

    public async setBreakpoints(sites: PlannedCaptureSite[]): Promise<void> {
        const toAdd: vscode.SourceBreakpoint[] = [];

        for (const site of sites) {
            const key = captureSiteKey(site.uri.fsPath, site.line);
            this.plannedSites.add(key);

            if (this.hasExistingBreakpoint(site.uri, site.line)) {
                console.log(`[BreakpointPlanner] skip duplicate line ${site.uri.fsPath}:${site.line}`);
                continue;
            }

            const location = new vscode.Location(
                site.uri,
                new vscode.Position(site.line - 1, 0)
            );
            toAdd.push(new vscode.SourceBreakpoint(location));
        }

        if (toAdd.length === 0) {
            return;
        }

        await vscode.debug.addBreakpoints(toAdd);
        this.pbBreakpoints.push(...toAdd);
        console.log(`[BreakpointPlanner] added ${toAdd.length} PB breakpoint(s)`);
    }

    public removeAll(): void {
        if (this.pbBreakpoints.length > 0) {
            vscode.debug.removeBreakpoints([...this.pbBreakpoints]);
            console.log(`[BreakpointPlanner] removed ${this.pbBreakpoints.length} PB breakpoint(s)`);
        }
        this.pbBreakpoints.length = 0;
        this.plannedSites.clear();
    }

    public dispose(): void {
        this.removeAll();
    }

    private collectFilePaths(entryPoint: string): string[] {
        const paths = new Set<string>();
        paths.add(normalizeSourcePath(entryPoint));

        for (const editor of vscode.window.visibleTextEditors) {
            const doc = editor.document;
            if (doc.uri.scheme !== 'file') {
                continue;
            }
            if (doc.languageId !== 'python') {
                continue;
            }
            if (!this.isInWorkspace(doc.uri.fsPath)) {
                continue;
            }
            paths.add(normalizeSourcePath(doc.uri.fsPath));
        }

        return Array.from(paths);
    }

    private isInWorkspace(fsPath: string): boolean {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return false;
        }
        const normalized = normalizeSourcePath(fsPath);
        return folders.some((folder) => {
            const root = normalizeSourcePath(folder.uri.fsPath);
            return normalized === root || normalized.startsWith(root + path.sep);
        });
    }

    private async loadPythonDocument(filePath: string): Promise<vscode.TextDocument | undefined> {
        const uri = vscode.Uri.file(normalizeSourcePath(filePath));
        const open = vscode.workspace.textDocuments.find(
            (doc) => doc.uri.toString() === uri.toString()
        );
        if (open) {
            return open;
        }

        try {
            return await vscode.workspace.openTextDocument(uri);
        } catch (err) {
            console.warn(`[BreakpointPlanner] could not open ${filePath}: ${err}`);
            return undefined;
        }
    }

    private hasExistingBreakpoint(uri: vscode.Uri, line: number): boolean {
        const targetLine = line - 1;
        for (const breakpoint of vscode.debug.breakpoints) {
            if (!(breakpoint instanceof vscode.SourceBreakpoint)) {
                continue;
            }
            if (breakpoint.location.uri.toString() !== uri.toString()) {
                continue;
            }
            if (breakpoint.location.range.start.line === targetLine) {
                return true;
            }
        }
        return false;
    }
}
