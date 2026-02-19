import * as vscode from 'vscode';
import { CodeLensStrategy } from './display/CodeLensStrategy';
/**
 * The display strategy instance.
 * Stored at module level so it's accessible in both activate and deactivate.
 */
let strategy: CodeLensStrategy | undefined;
/**
 * Called when the extension is activated.
 * 
 * Activation happens when:
 * - VS Code starts up (if extension is set to activate on startup)
 * - User opens a file matching activation events
 * - User runs a command from this extension
 * 
 * @param context - Extension context provided by VS Code
 */
export function activate(context: vscode.ExtensionContext) {
	console.log('Function Annotations extension is now active!');
	
	// Create the CodeLens strategy
	strategy = new CodeLensStrategy();
	
	// Activate it (registers providers, commands, etc.)
	strategy.activate(context);
	
	console.log('CodeLens strategy has been activated');
}
/**
 * Called when the extension is deactivated.
 * 
 * Deactivation happens when:
 * - VS Code is closing
 * - Extension is being disabled
 * - Extension is being uninstalled
 * - Extension is being reloaded
 * 
 * Important: Clean up resources here to prevent memory leaks
 */
export function deactivate() {
	console.log('Function Annotations extension is deactivating');
	
	// Deactivate the strategy (cleans up providers, commands, webviews, etc.)
	if (strategy) {
		strategy.deactivate();
		strategy = undefined;
	}
	
	console.log('Function Annotations extension has been deactivated');
}