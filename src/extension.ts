import * as vscode from 'vscode';
// import { CodeLensStrategy } from './display/CodeLensStrategy';
/**
 * The display strategy instance.
 * Stored at module level so it's accessible in both activate and deactivate.
 */
// let strategy: CodeLensStrategy | undefined;
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
	
	// // Create the CodeLens strategy
	// strategy = new CodeLensStrategy();
	
	// // Activate it (registers providers, commands, etc.)
	// strategy.activate(context);
	
	// console.log('CodeLens strategy has been activated');

// --- TESTING MVP DebugExecutor.ts COMMAND ---
	const testCommand = vscode.commands.registerCommand(
		'pbExtension.testDebugExecutor',
		async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage('No active editor');
				return;
			}
			const filePath = editor.document.uri.fsPath;
			
			// Import at top of file
			const { DebugExecutor } = require('./execution/DebugExecutor');
			
			// Create Python executor
			const executor = new DebugExecutor('python', 'python');
			
			if (!executor.canExecute(filePath)) {
				vscode.window.showErrorMessage('Cannot execute this file type');
				return;
			}
			vscode.window.showInformationMessage('Starting execution...');
			console.log('=== Testing DebugExecutor ===');
			
			try {
				const trace = await executor.execute(filePath);
				console.log('Execution completed!');
				console.log('Success:', trace.success);
				console.log('Error:', trace.error);
				console.log('Line states count:', trace.lineStates.size);
				// shows captured data in console for testing purposes
				for (const [line, state] of trace.lineStates) {
					console.log(`Line ${line}: ${state.variables.length} variables`);
					for (const variable of state.variables) {
						console.log(`  ${variable.name}: ${variable.value} (${variable.type})`);
					}
				}
				
				vscode.window.showInformationMessage(
					`Execution ${trace.success ? 'succeeded' : 'failed'}!`
				);
			} catch (err) {
				console.error('Execution failed:', err);
				vscode.window.showErrorMessage(`Execution failed: ${err}`);
			} finally {
				executor.dispose();
			}
		}
	);
	context.subscriptions.push(testCommand);
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
	
	// // Deactivate the strategy (cleans up providers, commands, webviews, etc.)
	// if (strategy) {
	// 	strategy.deactivate();
	// 	strategy = undefined;
	// }
	
	console.log('Function Annotations extension has been deactivated');
}