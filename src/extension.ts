import * as vscode from 'vscode';
import { pbLog } from './pbOutput';

export function activate(context: vscode.ExtensionContext) {
	pbLog('PB Extension (debugger-setup POC) activated.');

	context.subscriptions.push(
		vscode.commands.registerCommand('pbExtension.setupDebuggerFromDescription', async () => {
			void vscode.window.showInformationMessage(
				'PB: setup-from-description is not implemented yet (legacy stripped).'
			);
		}),
		vscode.commands.registerCommand('pbExtension.clearAssistantSetup', async () => {
			void vscode.window.showInformationMessage(
				'PB: clear-assistant-setup is not implemented yet (legacy stripped).'
			);
		})
	);
}

export function deactivate() {
	pbLog('PB Extension deactivated.');
}