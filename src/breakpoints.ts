import * as vscode from 'vscode';
import { pbLog } from './pbOutput';
import { DebuggerSetupPlan, PlannedBreakpoint } from './types';

let pbBreakpoints: vscode.Breakpoint[] = [];

function breakpointKey(filePath: string, line: number): string {
	return `${filePath}:${line}`;
}

function locationForLine(uri: vscode.Uri, line1Based: number): vscode.Location {
	return new vscode.Location(uri, new vscode.Position(line1Based - 1, 0));
}

function toSourceBreakpoint(
	uri: vscode.Uri,
	planned: PlannedBreakpoint
): vscode.SourceBreakpoint | null {
	const location = locationForLine(uri, planned.line);

	switch (planned.kind) {
		case 'line':
			return new vscode.SourceBreakpoint(location);
		case 'conditional': {
			const condition = planned.condition?.trim();
			if (!condition) {
				pbLog(`Skipping L${planned.line}: conditional breakpoint missing condition`);
				return null;
			}
			return new vscode.SourceBreakpoint(location, true, condition);
		}
		case 'logpoint': {
			const logMessage = planned.logMessage?.trim();
			if (!logMessage) {
				pbLog(`Skipping L${planned.line}: logpoint missing logMessage`);
				return null;
			}
			return new vscode.SourceBreakpoint(location, true, undefined, undefined, logMessage);
		}
		default:
			pbLog(`Skipping L${planned.line}: unknown kind "${planned.kind as string}"`);
			return null;
	}
}

export function clearPbBreakpoints(): void {
	if (pbBreakpoints.length === 0) {
		return;
	}
	vscode.debug.removeBreakpoints([...pbBreakpoints]);
	pbLog(`Removed ${pbBreakpoints.length} PB breakpoint(s).`);
	pbBreakpoints = [];
}

export function getPbBreakpointCount(): number {
	return pbBreakpoints.length;
}

export async function applyBreakpointsFromPlan(plan: DebuggerSetupPlan): Promise<number> {
	clearPbBreakpoints();

	const uri = vscode.Uri.file(plan.filePath);
	const seen = new Set<string>();
	const toAdd: vscode.SourceBreakpoint[] = [];
	const applied: PlannedBreakpoint[] = [];

	for (const planned of plan.breakpoints) {
		const key = breakpointKey(plan.filePath, planned.line);
		if (seen.has(key)) {
			pbLog(`Skipping duplicate breakpoint at L${planned.line}`);
			continue;
		}
		seen.add(key);

		const breakpoint = toSourceBreakpoint(uri, planned);
		if (!breakpoint) {
			continue;
		}
		toAdd.push(breakpoint);
		applied.push(planned);
	}

	if (toAdd.length === 0) {
		pbLog('No breakpoints to apply from plan.');
		return 0;
	}

	await vscode.debug.addBreakpoints(toAdd);
	pbBreakpoints = [...toAdd];

	const label = plan.workspaceRelativePath ?? plan.filePath;
	pbLog(`Applied ${toAdd.length} PB breakpoint(s) to ${label}.`);
	for (const planned of applied) {
		let detail = `  L${planned.line} [${planned.kind}]`;
		if (planned.kind === 'conditional' && planned.condition) {
			detail += ` when ${planned.condition}`;
		}
		if (planned.kind === 'logpoint' && planned.logMessage) {
			detail += ` log: ${planned.logMessage}`;
		}
		pbLog(detail);
	}

	return toAdd.length;
}
