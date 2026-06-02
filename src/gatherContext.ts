import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { getPythonInterpreter } from './config';
import { pbLog } from './pbOutput';
import {
	CaptureSite,
	GatheredContext,
	NumberedLine,
	SourceContext,
	SourceSelection,
} from './types';

const execFileAsync = promisify(execFile);
const STORAGE_KEY = 'pbExtension.userBugDescription';
const WATCHES_STORAGE_KEY = 'pbExtension.suggestedWatchExpressions';

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

export function getSuggestedWatchExpressions(context: vscode.ExtensionContext): string[] {
	const stored = context.globalState.get<string[]>(WATCHES_STORAGE_KEY, []);
	return Array.isArray(stored) ? stored.filter((w) => typeof w === 'string') : [];
}

export async function saveSuggestedWatchExpressions(
	context: vscode.ExtensionContext,
	watchExpressions: string[]
): Promise<void> {
	const cleaned = watchExpressions
		.map((w) => w.trim())
		.filter((w) => w.length > 0);
	await context.globalState.update(WATCHES_STORAGE_KEY, cleaned);
}

export async function clearSuggestedWatchExpressions(
	context: vscode.ExtensionContext
): Promise<void> {
	await context.globalState.update(WATCHES_STORAGE_KEY, []);
}

// builds the context object for LLM 
export async function gatherContext(context: vscode.ExtensionContext): Promise<GatheredContext> {
	const warnings: string[] = [];
	const user = { description: getSavedUserDescription(context) };
	const source = gatherActiveEditorSource(warnings);
	const captureSites =
		source && source.languageId === 'python'
			? await gatherCaptureSites(context, source, warnings)
			: [];

	return { user, source, captureSites, warnings };
}

// just logging for now 
export function logGatheredContextSummary(gathered: GatheredContext): void {
	pbLog(`Context gathered: user description ${gathered.user.description.length} chars`);
	if (gathered.source) {
		const label = gathered.source.workspaceRelativePath ?? gathered.source.filePath;
		pbLog(
			`Source: ${label} (${gathered.source.lineCount} lines, ${gathered.source.languageId}${gathered.source.isDirty ? ', unsaved' : ''})`
		);
		if (gathered.source.selection) {
			const { startLine, endLine } = gathered.source.selection;
			pbLog(`Selection: lines ${startLine}-${endLine}`);
		}
	} else {
		pbLog('Source: (none — no active editor)');
	}
	pbLog(`Capture sites: ${gathered.captureSites.length}`);
	for (const w of gathered.warnings) {
		pbLog(`Warning: ${w}`);
	}
}

function gatherActiveEditorSource(warnings: string[]): SourceContext | null {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		warnings.push('No active editor; open the Python file you want to debug.');
		return null;
	}

	const doc = editor.document;
	if (doc.languageId !== 'python') {
		warnings.push(
			`Active file is not Python (${doc.languageId}); POC supports Python only.`
		);
	}

	const content = doc.getText();
	const numberedLines = buildNumberedLines(content);

	let workspaceRelativePath: string | undefined;
	if (doc.uri.scheme === 'file') {
		const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
		if (folder) {
			workspaceRelativePath = path.relative(folder.uri.fsPath, doc.uri.fsPath);
		}
	}

	let selection: SourceSelection | undefined;
	if (!editor.selection.isEmpty) {
		selection = {
			startLine: editor.selection.start.line + 1,
			endLine: editor.selection.end.line + 1,
		};
	}

	return {
		filePath: doc.uri.scheme === 'file' ? doc.uri.fsPath : doc.uri.toString(),
		workspaceRelativePath,
		languageId: doc.languageId,
		content,
		lineCount: doc.lineCount,
		numberedLines,
		selection,
		isDirty: doc.isDirty,
	};
}

function buildNumberedLines(content: string): NumberedLine[] {
	if (content.length === 0) {
		return [];
	}
	const lines = content.split('\n');
	return lines.map((text, index) => ({
		lineNumber: index + 1,
		text,
	}));
}

async function gatherCaptureSites(
	context: vscode.ExtensionContext,
	source: SourceContext,
	warnings: string[]
): Promise<CaptureSite[]> {
	const scriptPath = path.join(context.extensionPath, 'scripts', 'detect_capture_sites.py');
	let targetPath = source.filePath;
	let tempPath: string | undefined;

	if (source.filePath.startsWith('untitled:') || !path.isAbsolute(source.filePath)) {
		tempPath = path.join(os.tmpdir(), `pb-capture-${Date.now()}.py`);
		await fs.writeFile(tempPath, source.content, 'utf8');
		targetPath = tempPath;
	} else if (source.isDirty) {
		tempPath = path.join(os.tmpdir(), `pb-capture-${Date.now()}.py`);
		await fs.writeFile(tempPath, source.content, 'utf8');
		targetPath = tempPath;
	}

	try {
		const python = getPythonInterpreter();
		const { stdout } = await execFileAsync(python, [scriptPath, targetPath], {
			maxBuffer: 10 * 1024 * 1024,
			timeout: 30_000,
		});

		const payload = JSON.parse(stdout.trim()) as {
			sites?: Array<{ line?: number; kind?: string }>;
			error?: string;
			message?: string;
		};

		if (payload.error) {
			warnings.push(
				`Capture site detection (${payload.error}): ${payload.message ?? 'unknown error'}`
			);
			return [];
		}

		const sites = payload.sites ?? [];
		return sites
			.filter(
				(site): site is { line: number; kind: string } =>
					typeof site.line === 'number' && typeof site.kind === 'string'
			)
			.map((site) => ({ line: site.line, kind: site.kind }));
	} catch (err) {
		warnings.push(`Capture site detection failed: ${String(err)}`);
		return [];
	} finally {
		if (tempPath) {
			await fs.unlink(tempPath).catch(() => undefined);
		}
	}
}
