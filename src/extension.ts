import * as vscode from 'vscode';
import * as path from 'path';
import { TraceManager } from './tracking/TraceManager';
import { AnnotationsProvider } from './display/AnnotationsProvider';
import { LLMFilterService } from './services/LLMFilterService';
import { FullTraceHoverProvider } from './display/FullTraceHoverProvider';
import { PbTraceCodeLensProvider } from './display/PbTraceCodeLensProvider';
import { refreshTraceDisplay } from './display/refreshTraceDisplay';
import { SessionOrchestrator } from './orchestration/SessionOrchestrator';
import { astCaptureSiteProvider } from './analysis/AstCaptureSiteProvider';
import { runPb, runPbExhaustive } from './commands/runPb';

let traceManager: TraceManager;
let sessionOrchestrator: SessionOrchestrator | undefined;
let annotationsProvider: AnnotationsProvider;
let llmFilterService: LLMFilterService | undefined;
let fullTraceHoverProvider: FullTraceHoverProvider | undefined;
let pbTraceCodeLensProvider: PbTraceCodeLensProvider | undefined;
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
function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

export function activate(context: vscode.ExtensionContext) {
	console.log('Function Annotations extension is now active!');

	traceManager = new TraceManager();
	astCaptureSiteProvider.initialize(context);

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

	annotationsProvider = new AnnotationsProvider(traceManager, llmFilterService);

	pbTraceCodeLensProvider = new PbTraceCodeLensProvider(traceManager);
	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider({ language: 'python' }, pbTraceCodeLensProvider)
	);

	sessionOrchestrator = new SessionOrchestrator(traceManager, context, (filePath) => {
		void refreshTraceDisplay(traceManager, annotationsProvider, pbTraceCodeLensProvider, filePath);
	});
	context.subscriptions.push(sessionOrchestrator);

	context.subscriptions.push(
		vscode.commands.registerCommand('pbExtension.startAttachedTracing', () => {
			void sessionOrchestrator?.startAttachedTracing();
		}),
		vscode.commands.registerCommand('pbExtension.stopAttachedTracing', () => {
			void sessionOrchestrator?.stopAttachedTracing();
		}),
		vscode.commands.registerCommand('pbExtension.toggleAttachedTracing', () => {
			if (sessionOrchestrator?.isAttachedTracingEnabled()) {
				void sessionOrchestrator.stopAttachedTracing();
			} else {
				void sessionOrchestrator?.startAttachedTracing();
			}
		}),
		vscode.commands.registerCommand('pbExtension.runPb', () => {
			void runPb({
				traceManager,
				sessionOrchestrator,
				annotationsProvider,
				pbTraceCodeLensProvider
			});
		}),
		vscode.commands.registerCommand('pbExtension.runPbExhaustive', () => {
			void runPbExhaustive({
				traceManager,
				sessionOrchestrator,
				annotationsProvider,
				pbTraceCodeLensProvider
			});
		}),
		vscode.commands.registerCommand(
			'pbExtension.showLineTrace',
			async (documentUri: string, lineNumber: number) => {
				const uri = vscode.Uri.parse(documentUri);
				const variables = traceManager.getLatestForFileLine(uri.fsPath, lineNumber);
				if (variables.length === 0) {
					void vscode.window.showInformationMessage(`No PB trace on line ${lineNumber}.`);
					return;
				}

				const items = variables.map((variable) => ({
					label: variable.name,
					description: variable.value.length > 80 ? `${variable.value.slice(0, 79)}…` : variable.value,
					detail: variable.type
				}));

				const rows = variables
					.map(
						(v) =>
							`<tr><td><code>${escapeHtml(v.name)}</code></td><td>${escapeHtml(v.value)}</td><td><em>${escapeHtml(v.type)}</em></td></tr>`
					)
					.join('');
				const panel = vscode.window.createWebviewPanel(
					'pbLineTrace',
					`PB trace — line ${lineNumber}`,
					vscode.ViewColumn.Beside,
					{ enableScripts: false }
				);
				panel.webview.html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); padding: 1rem;">
<h2>PB trace — line ${lineNumber}</h2>
<table border="1" cellpadding="6" style="border-collapse: collapse; width: 100%;">
<thead><tr><th>Variable</th><th>Value</th><th>Type</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`;

				await vscode.window.showQuickPick(items, {
					title: `PB full trace — line ${lineNumber}`,
					placeHolder: 'Captured variables (also opened in panel)'
				});
			}
		)
	);

	fullTraceHoverProvider = new FullTraceHoverProvider(traceManager);
	const hoverDisposable = vscode.languages.registerHoverProvider(
		{ language: 'python' },
		fullTraceHoverProvider
	);
	context.subscriptions.push(hoverDisposable);

	const toggleLLMCommand = vscode.commands.registerCommand(
		'pbExtension.toggleLLMFilter',
		async () => {
			const config = vscode.workspace.getConfiguration('pbExtension');
			const currentValue = config.get<boolean>('llmFilteringEnabled', true);
			const newValue = !currentValue;
			await config.update('llmFilteringEnabled', newValue, vscode.ConfigurationTarget.Global);
			vscode.window.showInformationMessage(`LLM Filter ${newValue ? 'enabled' : 'disabled'}`);

			const editor = vscode.window.activeTextEditor;
			if (editor) {
				await refreshTraceDisplay(
					traceManager,
					annotationsProvider,
					pbTraceCodeLensProvider,
					editor.document.uri.fsPath
				);
			}
		}
	);
	context.subscriptions.push(toggleLLMCommand);

	const showFullTraceCommand = vscode.commands.registerCommand(
		'pbExtension.showFullTrace',
		async () => {
			const trace = traceManager.getFullTrace();
			if (!trace) {
				vscode.window.showWarningMessage('No execution trace available. Run PB first.');
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
		if (editor) {
			traceManager.setActiveFilePath(editor.document.uri.fsPath);
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

	if (annotationsProvider) {
		annotationsProvider.dispose();
	}
	if (llmFilterService) {
		llmFilterService.clearCache();
	}
	sessionOrchestrator = undefined;
	fullTraceHoverProvider = undefined;
	llmFilterService = undefined;
	console.log('Function Annotations extension has been deactivated');
}