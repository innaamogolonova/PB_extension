import * as vscode from 'vscode';

const STORAGE_KEY = 'pbExtension.userBugDescription';

export interface GatheredContext {
	userDescription: string;
}

export function getSavedUserDescription(context: vscode.ExtensionContext): string {
	return context.globalState.get<string>(STORAGE_KEY, '');
}

export async function saveUserDescription(
	context: vscode.ExtensionContext,
	description: string
): Promise<void> {
	await context.globalState.update(STORAGE_KEY, description.trim());
}

export async function clearUserDescription(context: vscode.ExtensionContext): Promise<void> {
	await context.globalState.update(STORAGE_KEY, '');
}

export async function gatherContext(context: vscode.ExtensionContext): Promise<GatheredContext> {
	return {
		userDescription: getSavedUserDescription(context),
	};
}
