import OpenAI from 'openai';
import * as vscode from 'vscode';
import { getOpenAiApiKey } from './config';
import { getPbOutputChannel, pbLog } from './pbOutput';
import {
	DebuggerSetupPlan,
	GatheredContext,
	PlannedBreakpoint,
	PlannedBreakpointKind,
} from './types';

const OPENAI_MODEL = 'gpt-5-mini';
const MAX_NUMBERED_LINES_IN_PROMPT = 500;

const SYSTEM_PROMPT = `You are a Python debugging assistant for VS Code (debugpy).
Given a bug hypothesis, numbered source code, and optional capture-site hints, propose a debugger setup.

Respond with JSON only (no markdown), matching this schema:
{
  "summary": "brief explanation of the debugging strategy",
  "breakpoints": [
    {
      "line": <1-based line number>,
      "kind": "line" | "conditional" | "logpoint",
      "condition": "<Python expression; required when kind is conditional>",
      "logMessage": "<message; required when kind is logpoint>",
      "rationale": "why stop here"
    }
  ],
  "watchExpressions": ["<Python expressions to watch>"]
}

Rules:
- Use only line numbers that exist in the provided source.
- Prefer breakpoints that test the user's hypothesis.
- Capture-site hints are suggestions only; you choose final breakpoints.
- Keep the plan focused: typically 2–6 breakpoints and 0–5 watch expressions.`;

type ApiKeyValidation = { ok: true } | { ok: false; reason: string };

type RawPlanPayload = {
	summary?: string;
	breakpoints?: Array<{
		line?: number;
		kind?: string;
		condition?: string;
		logMessage?: string;
		rationale?: string;
	}>;
	watchExpressions?: string[];
};

const PLACEHOLDER_KEY_PATTERNS = [
	/^your-api-key/i,
	/^replace-me/i,
	/^xxx+$/i,
	/^sk-placeholder/i,
];

export function validateOpenAiApiKey(): ApiKeyValidation {
	const key = getOpenAiApiKey();
	if (key.length === 0) {
		return {
			ok: false,
			reason:
				'OpenAI API key is not set. Add "pbExtension.openaiApiKey" in VS Code Settings (User or Workspace).',
		};
	}
	for (const pattern of PLACEHOLDER_KEY_PATTERNS) {
		if (pattern.test(key)) {
			return {
				ok: false,
				reason:
					'OpenAI API key looks like a placeholder. Replace "pbExtension.openaiApiKey" with your real key.',
			};
		}
	}
	if (key.includes('your-api-key')) {
		return {
			ok: false,
			reason:
				'OpenAI API key still contains "your-api-key". Update "pbExtension.openaiApiKey" in Settings.',
		};
	}
	if (!key.startsWith('sk-')) {
		return {
			ok: false,
			reason:
				'OpenAI API key does not start with "sk-". Check "pbExtension.openaiApiKey" in Settings.',
		};
	}
	return { ok: true };
}

export function formatGatheredContextForPrompt(ctx: GatheredContext): string {
	const parts: string[] = [];

	parts.push('## Bug hypothesis');
	parts.push(ctx.user.description.trim() || '(empty)');

	if (!ctx.source) {
		parts.push('\n## Source\n(no active editor file)');
	} else {
		const src = ctx.source;
		parts.push('\n## File metadata');
		parts.push(`- path: ${src.workspaceRelativePath ?? src.filePath}`);
		parts.push(`- language: ${src.languageId}`);
		parts.push(`- lines: ${src.lineCount}`);
		if (src.isDirty) {
			parts.push('- note: buffer has unsaved changes');
		}
		if (src.selection) {
			parts.push(
				`- selection: lines ${src.selection.startLine}-${src.selection.endLine} (inclusive, 1-based)`
			);
		}

		parts.push('\n## Numbered source');
		parts.push(formatNumberedLinesForPrompt(src.numberedLines, src.lineCount));

		if (ctx.captureSites.length > 0) {
			parts.push('\n## Capture-site hints (AST-derived; optional)');
			for (const site of ctx.captureSites) {
				parts.push(`- L${site.line} [${site.kind}]`);
			}
		}
	}

	if (ctx.warnings.length > 0) {
		parts.push('\n## Gather warnings');
		for (const w of ctx.warnings) {
			parts.push(`- ${w}`);
		}
	}

	return parts.join('\n');
}

function formatNumberedLinesForPrompt(
	numberedLines: { lineNumber: number; text: string }[],
	lineCount: number
): string {
	if (numberedLines.length === 0) {
		return '(empty file)';
	}
	if (numberedLines.length <= MAX_NUMBERED_LINES_IN_PROMPT) {
		return numberedLines
			.map((line) => `${String(line.lineNumber).padStart(4)} | ${line.text}`)
			.join('\n');
	}
	const head = numberedLines.slice(0, 400);
	const tail = numberedLines.slice(-50);
	const omitted = lineCount - head.length - tail.length;
	const headText = head
		.map((line) => `${String(line.lineNumber).padStart(4)} | ${line.text}`)
		.join('\n');
	const tailText = tail
		.map((line) => `${String(line.lineNumber).padStart(4)} | ${line.text}`)
		.join('\n');
	return `${headText}\n... (${omitted} lines omitted) ...\n${tailText}`;
}

export function logDebuggerSetupPlan(plan: DebuggerSetupPlan): void {
	pbLog('--- Debugger setup plan (LLM) ---');
	if (plan.summary) {
		pbLog(`Summary: ${plan.summary}`);
	}
	const label = plan.workspaceRelativePath ?? plan.filePath;
	pbLog(`File: ${label}`);
	pbLog(`Breakpoints (${plan.breakpoints.length}):`);
	if (plan.breakpoints.length === 0) {
		pbLog('  (none)');
	}
	for (const bp of plan.breakpoints) {
		let detail = `  L${bp.line} [${bp.kind}]`;
		if (bp.kind === 'conditional' && bp.condition) {
			detail += ` when ${bp.condition}`;
		}
		if (bp.kind === 'logpoint' && bp.logMessage) {
			detail += ` log: ${bp.logMessage}`;
		}
		if (bp.rationale) {
			detail += ` — ${bp.rationale}`;
		}
		pbLog(detail);
	}
	pbLog(`Watch expressions (${plan.watchExpressions.length}):`);
	if (plan.watchExpressions.length === 0) {
		pbLog('  (none)');
	}
	for (const watch of plan.watchExpressions) {
		pbLog(`  ${watch}`);
	}
	pbLog('Plan JSON:');
	pbLog(JSON.stringify(plan, null, 2));
	pbLog('--- End debugger setup plan ---');
}

export function parseDebuggerSetupPlan(
	raw: string,
	ctx: GatheredContext
): DebuggerSetupPlan | null {
	if (!ctx.source) {
		pbLog('Cannot parse debugger plan: no source file in context.');
		return null;
	}

	let payload: RawPlanPayload;
	try {
		payload = JSON.parse(raw) as RawPlanPayload;
	} catch {
		pbLog(`Failed to parse LLM JSON: ${raw.slice(0, 500)}`);
		return null;
	}

	const lineCount = ctx.source.lineCount;
	const breakpoints: PlannedBreakpoint[] = [];

	for (const rawBp of payload.breakpoints ?? []) {
		const parsed = parsePlannedBreakpoint(rawBp, lineCount);
		if (parsed) {
			breakpoints.push(parsed);
		}
	}

	const watchExpressions = (payload.watchExpressions ?? []).filter(
		(w): w is string => typeof w === 'string' && w.trim().length > 0
	);

	return {
		filePath: ctx.source.filePath,
		workspaceRelativePath: ctx.source.workspaceRelativePath,
		breakpoints,
		watchExpressions,
		summary: typeof payload.summary === 'string' ? payload.summary.trim() : undefined,
	};
}

function parsePlannedBreakpoint(
	raw: NonNullable<RawPlanPayload['breakpoints']>[number],
	lineCount: number
): PlannedBreakpoint | null {
	if (typeof raw.line !== 'number' || !Number.isInteger(raw.line)) {
		pbLog(`Skipping breakpoint with invalid line: ${JSON.stringify(raw)}`);
		return null;
	}
	if (raw.line < 1 || raw.line > lineCount) {
		pbLog(`Skipping breakpoint at L${raw.line}: out of range 1-${lineCount}`);
		return null;
	}

	const kind = raw.kind as PlannedBreakpointKind;
	if (kind !== 'line' && kind !== 'conditional' && kind !== 'logpoint') {
		pbLog(`Skipping breakpoint at L${raw.line}: unknown kind "${String(raw.kind)}"`);
		return null;
	}

	if (kind === 'conditional' && (!raw.condition || !raw.condition.trim())) {
		pbLog(`Skipping conditional breakpoint at L${raw.line}: missing condition`);
		return null;
	}
	if (kind === 'logpoint' && (!raw.logMessage || !raw.logMessage.trim())) {
		pbLog(`Skipping logpoint at L${raw.line}: missing logMessage`);
		return null;
	}

	return {
		line: raw.line,
		kind,
		condition: raw.condition?.trim(),
		logMessage: raw.logMessage?.trim(),
		rationale: typeof raw.rationale === 'string' ? raw.rationale.trim() : undefined,
	};
}

export async function requestDebuggerSetupPlan(
	ctx: GatheredContext
): Promise<DebuggerSetupPlan | null> {
	const client = new OpenAI({ apiKey: getOpenAiApiKey() });
	const userContent = formatGatheredContextForPrompt(ctx);

	pbLog(`Calling OpenAI (${OPENAI_MODEL}) for debugger setup plan…`);

	const response = await client.chat.completions.create({
		model: OPENAI_MODEL,
		response_format: { type: 'json_object' },
		messages: [
			{ role: 'system', content: SYSTEM_PROMPT },
			{ role: 'user', content: userContent },
		],
	});

	pbLog('OpenAI response received; parsing plan…');

	const raw = response.choices[0]?.message?.content?.trim() ?? '';
	if (!raw) {
		pbLog('OpenAI returned an empty response.');
		return null;
	}

	return parseDebuggerSetupPlan(raw, ctx);
}

function validateGatheredContextForPlan(ctx: GatheredContext): string | null {
	if (!ctx.user.description.trim()) {
		return 'Enter a bug description in the PB Debugger view before running setup.';
	}
	if (!ctx.source) {
		return 'Open the Python file you want to debug in the active editor.';
	}
	if (ctx.source.languageId !== 'python') {
		return `Active file is not Python (${ctx.source.languageId}). POC supports Python only.`;
	}
	return null;
}

export async function planDebuggerSetup(ctx: GatheredContext): Promise<DebuggerSetupPlan | null> {
	pbLog('planDebuggerSetup: starting (LLM request)…');
	getPbOutputChannel().show(true);

	const keyCheck = validateOpenAiApiKey();
	if (!keyCheck.ok) {
		pbLog(`OpenAI API key: ${keyCheck.reason}`);
		void vscode.window.showErrorMessage(`PB: ${keyCheck.reason}`);
		return null;
	}

	for (const warning of ctx.warnings) {
		pbLog(`Context warning: ${warning}`);
	}

	const contextError = validateGatheredContextForPlan(ctx);
	if (contextError) {
		pbLog(`Cannot plan debugger setup: ${contextError}`);
		void vscode.window.showWarningMessage(`PB: ${contextError}`);
		return null;
	}

	try {
		const plan = await requestDebuggerSetupPlan(ctx);
		if (!plan) {
			void vscode.window.showErrorMessage(
				'PB: could not build a debugger setup plan from the LLM response.'
			);
			return null;
		}
		if (plan.breakpoints.length === 0) {
			pbLog('Warning: LLM returned no breakpoints.');
		}
		logDebuggerSetupPlan(plan);
		void vscode.window.showInformationMessage(
			`PB: debugger plan ready (${plan.breakpoints.length} breakpoint(s), ${plan.watchExpressions.length} watch(es)). See Output → PB Extension.`
		);
		return plan;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		pbLog(`OpenAI request failed: ${message}`);
		void vscode.window.showErrorMessage(`PB: OpenAI request failed. See Output → PB Extension.`);
		return null;
	}
}
