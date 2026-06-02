import * as vscode from 'vscode';
import {
	clearUserDescription,
	gatherContext,
	getSavedUserDescription,
	logGatheredContextSummary,
	saveUserDescription,
} from './gatherContext';
import { planDebuggerSetup } from './llmDebuggerPlan';
import { pbLog } from './pbOutput';

export const BUG_SPEC_VIEW_ID = 'pbExtension.bugSpecView';
const PB_DEBUGGER_CONTAINER_ID = 'pbDebugger';

type WebviewToExtensionMessage = { type: 'submit'; description: string };
type ExtensionToWebviewMessage = { type: 'init'; description: string };

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
			await planDebuggerSetup(gathered);
			void vscode.window.showInformationMessage('PB: bug description saved.');
		});

		webviewView.onDidChangeVisibility(() => {
			if (webviewView.visible) {
				this.postInit();
			}
		});

		this.postInit();
	}

	public async reveal(): Promise<void> {
		await openBugSpecView();
	}

	public postInit(): void {
		const description = getSavedUserDescription(this.extensionContext);
		const message: ExtensionToWebviewMessage = { type: 'init', description };
		void this.view?.webview.postMessage(message);
	}

	public async clear(): Promise<void> {
		await clearUserDescription(this.extensionContext);
		this.postInit();
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
	</style>
</head>
<body>
	<label for="description">Bug description or hypothesis</label>
	<textarea id="description" placeholder="Describe what you think is wrong…"></textarea>
	<button id="submit" type="button">Save</button>
	<p class="hint">Saved text is used when gathering context for the LLM.</p>
	<script>
		const vscode = acquireVsCodeApi();
		const textarea = document.getElementById('description');
		const submitBtn = document.getElementById('submit');

		submitBtn.addEventListener('click', () => {
			vscode.postMessage({ type: 'submit', description: textarea.value });
		});

		window.addEventListener('message', (event) => {
			const msg = event.data;
			if (msg && msg.type === 'init' && typeof msg.description === 'string') {
				textarea.value = msg.description;
			}
		});
	</script>
</body>
</html>`;
}
