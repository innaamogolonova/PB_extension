import * as vscode from 'vscode';
import {
	clearSuggestedWatchExpressions,
	clearUserDescription,
	gatherContext,
	getSavedUserDescription,
	getSuggestedWatchExpressions,
	logGatheredContextSummary,
	saveSuggestedWatchExpressions,
	saveUserDescription,
} from './gatherContext';
import { DebuggerSetupPlan } from './types';
import { executeDebuggerSetup } from './launch';
import { planDebuggerSetup } from './llmDebuggerPlan';
import { pbLog } from './pbOutput';

export const BUG_SPEC_VIEW_ID = 'pbExtension.bugSpecView';
const PB_DEBUGGER_CONTAINER_ID = 'pbDebugger';

type WebviewToExtensionMessage = { type: 'submit'; description: string };
type ExtensionToWebviewMessage = {
	type: 'init';
	description: string;
	watchExpressions: string[];
};

export class BugSpecViewProvider implements vscode.WebviewViewProvider {
	private view?: vscode.WebviewView;

	constructor(private readonly extensionContext: vscode.ExtensionContext) {}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	): void {
		this.view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
		};
		webviewView.webview.html = getWebviewHtml();

		webviewView.webview.onDidReceiveMessage(async (raw: unknown) => {
			const message = raw as WebviewToExtensionMessage;
			if (message.type !== 'submit' || typeof message.description !== 'string') {
				return;
			}

			await saveUserDescription(this.extensionContext, message.description);
			const gathered = await gatherContext(this.extensionContext);
			const { description } = gathered.user;
			pbLog('User bug description recorded from input box.');
			if (description.length === 0) {
				pbLog('Recorded text: (empty)');
			} else {
				pbLog(`Recorded text (${description.length} chars):\n${description}`);
			}
			logGatheredContextSummary(gathered);
			const plan = await planDebuggerSetup(gathered);
			if (plan) {
				await this.applyPlanToView(plan);
				await executeDebuggerSetup(plan);
			}
			void vscode.window.showInformationMessage('PB: bug description saved.');
		});

		webviewView.onDidChangeVisibility(() => {
			if (webviewView.visible) {
				this.refreshView();
			}
		});

		this.refreshView();
	}

	public async reveal(): Promise<void> {
		await openBugSpecView();
	}

	public refreshView(): void {
		const description = getSavedUserDescription(this.extensionContext);
		const watchExpressions = getSuggestedWatchExpressions(this.extensionContext);
		const message: ExtensionToWebviewMessage = {
			type: 'init',
			description,
			watchExpressions,
		};
		void this.view?.webview.postMessage(message);
	}

	public async applyPlanToView(plan: DebuggerSetupPlan): Promise<void> {
		await saveSuggestedWatchExpressions(this.extensionContext, plan.watchExpressions);
		this.refreshView();
	}

	public async clear(): Promise<void> {
		await clearUserDescription(this.extensionContext);
		await clearSuggestedWatchExpressions(this.extensionContext);
		this.refreshView();
	}
}

/** Opens the PB Debugger container on the secondary side bar and focuses the bug description view. */
export async function openBugSpecView(): Promise<void> {
	try {
		await vscode.commands.executeCommand(`workbench.view.extension.${PB_DEBUGGER_CONTAINER_ID}`);
		await vscode.commands.executeCommand(`${BUG_SPEC_VIEW_ID}.focus`);
		pbLog('Bug description view opened.');
	} catch (err) {
		pbLog(`Failed to open bug description view: ${String(err)}`);
		void vscode.window.showErrorMessage(
			'PB: could not open bug description view. Try View → Appearance → Secondary Side Bar.'
		);
	}
}

export function registerBugSpecView(context: vscode.ExtensionContext): BugSpecViewProvider {
	const provider = new BugSpecViewProvider(context);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(BUG_SPEC_VIEW_ID, provider, {
			webviewOptions: { retainContextWhenHidden: true },
		})
	);
	return provider;
}

function getWebviewHtml(): string {
	const cspSource = "'unsafe-inline'";

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource}; script-src ${cspSource};" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<style>
		* { box-sizing: border-box; }
		body {
			margin: 0;
			padding: 8px;
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			background: var(--vscode-sideBar-background);
		}
		label {
			display: block;
			margin-bottom: 6px;
			font-weight: 600;
		}
		textarea {
			width: 100%;
			min-height: 120px;
			resize: vertical;
			padding: 8px;
			border: 1px solid var(--vscode-input-border, transparent);
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			font-family: inherit;
			font-size: inherit;
			line-height: 1.4;
		}
		textarea:focus {
			outline: 1px solid var(--vscode-focusBorder);
		}
		button {
			margin-top: 8px;
			width: 100%;
			padding: 6px 12px;
			border: none;
			cursor: pointer;
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			font-family: inherit;
			font-size: inherit;
		}
		button:hover {
			background: var(--vscode-button-hoverBackground);
		}
		.hint {
			margin-top: 6px;
			font-size: 0.85em;
			opacity: 0.8;
		}
		.watches-section {
			margin-top: 16px;
			padding-top: 12px;
			border-top: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.35));
		}
		.watches-section h2 {
			margin: 0 0 8px;
			font-size: inherit;
			font-weight: 600;
		}
		#watch-list {
			margin: 0;
			padding: 0;
			list-style: none;
		}
		#watch-list li {
			padding: 4px 8px;
			margin-bottom: 4px;
			font-family: var(--vscode-editor-font-family);
			font-size: 0.9em;
			background: var(--vscode-textCodeBlock-background, rgba(128, 128, 128, 0.15));
			border-radius: 3px;
			word-break: break-word;
		}
		.watches-empty {
			font-size: 0.85em;
			opacity: 0.75;
			font-style: italic;
		}
	</style>
</head>
<body>
	<label for="description">Bug description or hypothesis</label>
	<textarea id="description" placeholder="Describe what you think is wrong…"></textarea>
	<button id="submit" type="button">Save</button>
	<p class="hint">Saved text is used when gathering context for the LLM.</p>
	<section class="watches-section" aria-labelledby="watches-heading">
		<h2 id="watches-heading">Suggested watch expressions</h2>
		<ul id="watch-list"></ul>
		<p id="watches-empty" class="watches-empty">Save a hypothesis to generate watch suggestions.</p>
	</section>
	<script>
		const vscode = acquireVsCodeApi();
		const textarea = document.getElementById('description');
		const submitBtn = document.getElementById('submit');
		const watchList = document.getElementById('watch-list');
		const watchesEmpty = document.getElementById('watches-empty');

		function renderWatchExpressions(watchExpressions) {
			watchList.textContent = '';
			if (!Array.isArray(watchExpressions) || watchExpressions.length === 0) {
				watchesEmpty.style.display = 'block';
				watchesEmpty.textContent =
					textarea.value.trim().length === 0
						? 'Save a hypothesis to generate watch suggestions.'
						: 'No watch expressions in the latest plan.';
				return;
			}
			watchesEmpty.style.display = 'none';
			for (const expr of watchExpressions) {
				const li = document.createElement('li');
				li.textContent = expr;
				watchList.appendChild(li);
			}
		}

		submitBtn.addEventListener('click', () => {
			vscode.postMessage({ type: 'submit', description: textarea.value });
		});

		window.addEventListener('message', (event) => {
			const msg = event.data;
			if (msg && msg.type === 'init') {
				if (typeof msg.description === 'string') {
					textarea.value = msg.description;
				}
				renderWatchExpressions(msg.watchExpressions);
			}
		});
	</script>
</body>
</html>`;
}
