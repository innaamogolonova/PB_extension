import * as vscode from 'vscode';
import { clearPbBreakpoints } from './breakpoints';
import { openBugSpecView, registerBugSpecView } from './bugSpecView';
import { gatherContext, logGatheredContextSummary } from './gatherContext';
import { executeDebuggerSetup } from './launch';
import { planDebuggerSetup } from './llmDebuggerPlan';
import { pbLog } from './pbOutput';

export function activate(context: vscode.ExtensionContext) {
	pbLog('PB Extension (debugger-setup POC) activated.');

	const bugSpecView = registerBugSpecView(context);

	void openBugSpecView();

	context.subscriptions.push(
		vscode.commands.registerCommand('pbExtension.setupDebuggerFromDescription', async () => {
			await bugSpecView.reveal();
			const gathered = await gatherContext(context);
			logGatheredContextSummary(gathered);
			const plan = await planDebuggerSetup(gathered);
			if (plan) {
				await bugSpecView.applyPlanToView(plan);
				await executeDebuggerSetup(plan);
			}
		}),
		vscode.commands.registerCommand('pbExtension.clearAssistantSetup', async () => {
			await bugSpecView.clear();
			clearPbBreakpoints();
			void vscode.window.showInformationMessage('PB: bug description cleared.');
			pbLog('Bug description cleared.');
		})
	);
}

export function deactivate() {
	pbLog('PB Extension deactivated.');
}
