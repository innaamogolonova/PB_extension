import * as vscode from 'vscode';
import { openBugSpecView, registerBugSpecView } from './bugSpecView';
import { pbLog } from './pbOutput';

export function activate(context: vscode.ExtensionContext) {
	pbLog('PB Extension (debugger-setup POC) activated.');

	const bugSpecView = registerBugSpecView(context);

	void openBugSpecView();

	context.subscriptions.push(
		vscode.commands.registerCommand('pbExtension.setupDebuggerFromDescription', async () => {
			await bugSpecView.reveal();
		}),
		vscode.commands.registerCommand('pbExtension.clearAssistantSetup', async () => {
			await bugSpecView.clear();
			void vscode.window.showInformationMessage('PB: bug description cleared.');
			pbLog('Bug description cleared.');
		})
	);
}

export function deactivate() {
	pbLog('PB Extension deactivated.');
}
