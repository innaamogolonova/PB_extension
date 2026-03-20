import * as vscode from 'vscode';
import * as path from 'path';
import { TraceManager } from './tracking/TraceManager';
import { AnnotationsProvider } from './display/AnnotationsProvider';
import { LLMFilterService } from './services/LLMFilterService';
import { FullTraceHoverProvider } from './display/FullTraceHoverProvider';
// import { CodeLensStrategy } from './display/CodeLensStrategy';
/**
 * The display strategy instance.
 * Stored at module level so it's accessible in both activate and deactivate.
 */
// let strategy: CodeLensStrategy | undefined;
let traceManager: TraceManager;
let annotationsProvider: AnnotationsProvider;
let llmFilterService: LLMFilterService | undefined;
let fullTraceHoverProvider: FullTraceHoverProvider | undefined;
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

	// Initialize LLM service if API key is configured
	const config = vscode.workspace.getConfiguration('pbExtension');
	const apiKey = config.get<string>('openaiApiKey', '');
	if (apiKey.trim().length > 0) {
		llmFilterService = new LLMFilterService(apiKey);
	} else {
		vscode.window.showWarningMessage(
			'PB Extension: OpenAI API key not configured. LLM features disabled.'
		);
	}

	// Create providers (AnnotationsProvider receives LLM service for filtering)
	annotationsProvider = new AnnotationsProvider(traceManager, llmFilterService);

	fullTraceHoverProvider = new FullTraceHoverProvider(traceManager);
	const hoverDisposable = vscode.languages.registerHoverProvider(
		{ language: 'python' },
		fullTraceHoverProvider
	);
	context.subscriptions.push(hoverDisposable);

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

	const toggleLLMCommand = vscode.commands.registerCommand(
		'pbExtension.toggleLLMFilter',
		async () => {
			const config = vscode.workspace.getConfiguration('pbExtension');
			const currentValue = config.get<boolean>('llmFilteringEnabled', true);
			const newValue = !currentValue;
			await config.update('llmFilteringEnabled', newValue, vscode.ConfigurationTarget.Global);
			vscode.window.showInformationMessage(`LLM Filter ${newValue ? 'enabled' : 'disabled'}`);

			const editor = vscode.window.activeTextEditor;
			const trace = traceManager.getFullTrace();
			if (editor && trace && editor.document.uri.fsPath === trace.filePath) {
				await annotationsProvider.applyAnnotations(editor);
			}
		}
	);
	context.subscriptions.push(toggleLLMCommand);

	const showFullTraceCommand = vscode.commands.registerCommand(
		'pbExtension.showFullTrace',
		async () => {
			const trace = traceManager.getFullTrace();
			if (!trace) {
				vscode.window.showWarningMessage('No execution trace available. Run Test Debug Executor first.');
				return;
			}

			const { readFile } = await import('node:fs/promises');
			const traceFileName = `${path.basename(trace.filePath, path.extname(trace.filePath))}_trace.json`;
			const traceDir = path.join(path.dirname(trace.filePath), 'traces');
			const traceFilePath = path.join(traceDir, traceFileName);

			let traceJson: string;
			try {
				traceJson = await readFile(traceFilePath, 'utf-8');
			} catch (err) {
				vscode.window.showErrorMessage(`Trace file not found: ${traceFilePath}`);
				return;
			}

			const panel = vscode.window.createWebviewPanel(
				'pbTraceViewer',
				`Trace: ${path.basename(trace.filePath)}`,
				vscode.ViewColumn.Beside,
				{ enableScripts: false }
			);

			const escapedJson = traceJson
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');

			panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>Execution Trace</title>
	<style>
		body {
			font-family: var(--vscode-editor-font-family);
			font-size: var(--vscode-editor-font-size);
			line-height: 1.5;
			padding: 16px;
			color: var(--vscode-editor-foreground);
			background: var(--vscode-editor-background);
		}
		pre {
			white-space: pre-wrap;
			word-break: break-word;
			margin: 0;
		}
		h2 {
			margin-top: 0;
		}
	</style>
</head>
<body>
	<h2>${path.basename(traceFilePath)}</h2>
	<pre>${escapedJson}</pre>
</body>
</html>`;
		}
	);
	context.subscriptions.push(showFullTraceCommand);

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
	if (llmFilterService) {
		llmFilterService.clearCache();
	}
	fullTraceHoverProvider = undefined;
	llmFilterService = undefined;
	console.log('Function Annotations extension has been deactivated');
}