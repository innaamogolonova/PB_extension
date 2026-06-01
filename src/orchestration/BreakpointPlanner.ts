import * as vscode from 'vscode';
import { captureSiteKey } from './pathUtils';

export interface PlannedCaptureSite {
    uri: vscode.Uri;
    /** 1-based line number */
    line: number;
}

/**
 * Legacy helper (restored for repurposing): manages extension-owned source breakpoints.
 *
 * Note: the old heuristic planning logic was removed as part of the hard pivot.
 */
export class BreakpointPlanner implements vscode.Disposable {
    private readonly pbBreakpoints: vscode.Breakpoint[] = [];
    private readonly plannedSites = new Set<string>();

    public getPlannedSites(): ReadonlySet<string> {
        return this.plannedSites;
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
