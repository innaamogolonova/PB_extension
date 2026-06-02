import * as path from 'path';
import * as vscode from 'vscode';
import { applyBreakpointsFromPlan } from './breakpoints';
import { getPythonDebugAdapterType } from './config';
import { pbLog } from './pbOutput';
import { DebuggerSetupPlan } from './types';

export function getWorkspaceFolderForFile(
	filePath: string
): vscode.WorkspaceFolder | undefined {
	return vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
}

export async function ensureFileSaved(filePath: string): Promise<boolean> {
	const normalized = path.normalize(filePath);
	for (const doc of vscode.workspace.textDocuments) {
		if (doc.uri.scheme !== 'file') {
			continue;
		}
		if (path.normalize(doc.uri.fsPath) !== normalized) {
			continue;
		}
		if (!doc.isDirty) {
			return true;
		}
		const saved = await doc.save();
		if (saved) {
			pbLog(`Saved ${path.basename(filePath)} before debugging.`);
		} else {
			pbLog(`Warning: could not save ${path.basename(filePath)} before debugging.`);
		}
		return saved;
	}
	return true;
}

async function fileExistsOnDisk(filePath: string): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
		return true;
	} catch {
		return false;
	}
}

export function buildDebugpyLaunchConfig(
	plan: DebuggerSetupPlan,
	workspaceFolder: vscode.WorkspaceFolder
): vscode.DebugConfiguration {
	return {
		type: getPythonDebugAdapterType(),
		request: 'launch',
		name: 'PB: Debug',
		program: plan.filePath,
		cwd: workspaceFolder.uri.fsPath,
		console: 'integratedTerminal',
		justMyCode: true,
	};
}

export async function startPythonDebugSession(
	plan: DebuggerSetupPlan,
	workspaceFolder: vscode.WorkspaceFolder
): Promise<boolean> {
	const config = buildDebugpyLaunchConfig(plan, workspaceFolder);
	pbLog(`Launching debugpy for ${plan.workspaceRelativePath ?? plan.filePath}`);

	const started = await vscode.debug.startDebugging(workspaceFolder, config);
	if (!started) {
		pbLog(
			'Failed to start debug session. Ensure the Python extension is installed and debugpy is available.'
		);
		return false;
	}

	pbLog('Debug session started.');
	return true;
}

function logWatchExpressions(plan: DebuggerSetupPlan): void {
	if (plan.watchExpressions.length === 0) {
		return;
	}
	pbLog('Suggested watch expressions (add manually in the Watch panel):');
	for (const watch of plan.watchExpressions) {
		pbLog(`  ${watch}`);
	}
}

export async function executeDebuggerSetup(plan: DebuggerSetupPlan): Promise<boolean> {
	pbLog('executeDebuggerSetup: applying plan and launching debugger…');

	if (!plan.filePath || plan.filePath.startsWith('untitled:')) {
		const message = 'Cannot debug: save the file to disk first.';
		pbLog(message);
		void vscode.window.showErrorMessage(`PB: ${message}`);
		return false;
	}

	if (!(await fileExistsOnDisk(plan.filePath))) {
		const message = `Cannot debug: file not found (${plan.filePath}).`;
		pbLog(message);
		void vscode.window.showErrorMessage(`PB: ${message}`);
		return false;
	}

	const workspaceFolder = getWorkspaceFolderForFile(plan.filePath);
	if (!workspaceFolder) {
		const message = 'Open a workspace folder that contains the file you want to debug.';
		pbLog(message);
		void vscode.window.showErrorMessage(`PB: ${message}`);
		return false;
	}

	if (vscode.debug.activeDebugSession) {
		pbLog(
			'Warning: a debug session is already active. PB will still apply breakpoints and start another launch if supported.'
		);
	}

	await ensureFileSaved(plan.filePath);

	const applied = await applyBreakpointsFromPlan(plan);
	if (applied === 0) {
		pbLog('Warning: no breakpoints were applied; launching debugger anyway.');
	}

	const launched = await startPythonDebugSession(plan, workspaceFolder);
	if (!launched) {
		void vscode.window.showErrorMessage(
			'PB: could not start the debug session. See Output → PB Extension.'
		);
		return false;
	}

	logWatchExpressions(plan);

	void vscode.window.showInformationMessage(
		`PB: debugging started with ${applied} breakpoint(s).`
	);
	return true;
}
