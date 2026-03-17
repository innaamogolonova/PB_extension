import * as vscode from 'vscode';
import * as path from 'path';
import { TraceManager } from './tracking/TraceManager';
import { AnnotationsProvider } from './display/AnnotationsProvider';
// import { CodeLensStrategy } from './display/CodeLensStrategy';
/**
 * The display strategy instance.
 * Stored at module level so it's accessible in both activate and deactivate.
 */
// let strategy: CodeLensStrategy | undefined;
let traceManager: TraceManager;
let annotationsProvider: AnnotationsProvider;
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

	traceManager = new TraceManager();
	annotationsProvider = new AnnotationsProvider(traceManager);

// --- TESTING MVP DebugExecutor.ts COMMAND ---
	const testCommand = vscode.commands.registerCommand(
		'pbExtension.testDebugExecutor',
		async () => {

			//  checks and makes traces directory
			const { mkdir } = require('node:fs/promises');
			const { writeFile } = require('node:fs/promises');

			async function makeDirectory() {
				const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
				if (!workspaceFolder) {
					vscode.window.showErrorMessage('Please open a workspace folder');
					throw new Error('No workspace folder'); // Change return to throw
				}
				const projectFolder = path.join(workspaceFolder.uri.fsPath, 'traces');
				const dirCreation = await mkdir(projectFolder, { recursive: true });

				console.log(dirCreation);
				return projectFolder;
			}

			const projectFolder = await makeDirectory().catch((err) => {
				vscode.window.showErrorMessage(`Failed to create traces directory: ${err}`);
				throw err; // Stop execution if we can't create the folder
			});

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

				traceManager.setTrace(trace);
				console.log('[Extension] Trace loaded into TraceManager');

				await annotationsProvider.applyAnnotations(editor);

				// convert trace to JSON-serializable format
				const serializedTrace = DebugExecutor.traceToJSON(trace);

				// for writing to file
				const fileName = path.basename(filePath, path.extname(filePath));
				const traceFileName = `${fileName}_trace.json`;
				const fullTracePath = path.join(projectFolder, traceFileName);

				const jsonContent = JSON.stringify(serializedTrace, null, 2);
				await writeFile(fullTracePath, jsonContent, 'utf-8');
				console.log(`✅ Trace saved to: ${fullTracePath}`);

				console.log('Execution completed!');
				console.log('Success:', trace.success);
				console.log('Error:', trace.error);
				console.log('Line states count:', trace.lineStates.size);

				for (const [line, states] of trace.lineStates) {
					console.log(`Line ${line}: visited ${states.length} time(s)`);
					states.forEach((state: any, index: number) => {
						console.log(`  Visit ${index + 1}:`);
						for (const variable of state.variables) {
							console.log(`    ${variable.name}: ${variable.value} (${variable.type})`);
						}
					});
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

	const activeEditorChangeListener = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
		const trace = traceManager.getFullTrace();
		if (editor && trace && editor.document.uri.fsPath === trace.filePath) {
			await annotationsProvider.applyAnnotations(editor);
		}
	});
	context.subscriptions.push(activeEditorChangeListener);
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
	
	if (annotationsProvider) {
		annotationsProvider.dispose();
	}
	console.log('Function Annotations extension has been deactivated');
}