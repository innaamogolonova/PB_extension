import * as vscode from 'vscode';
import { pbLog } from './pbOutput';
import { DebuggerSetupPlan } from './types';

const ADD_TO_WATCH_COMMAND = 'debug.addToWatchExpressions';

type AddToWatchCommandArgument = {
	variable: {
		evaluateName: string;
	};
};

export function normalizeWatchExpressions(watchExpressions: string[]): string[] {
	const seen = new Set<string>();
	const normalized: string[] = [];

	for (const raw of watchExpressions) {
		const expression = raw.trim();
		if (!expression || seen.has(expression)) {
			continue;
		}
		seen.add(expression);
		normalized.push(expression);
	}

	return normalized;
}

export async function applyWatchExpressionsFromPlan(
	plan: DebuggerSetupPlan
): Promise<number> {
	const expressions = normalizeWatchExpressions(plan.watchExpressions);
	if (expressions.length === 0) {
		pbLog('No watch expressions to add from plan.');
		return 0;
	}

	const commands = await vscode.commands.getCommands(true);
	if (!commands.includes(ADD_TO_WATCH_COMMAND)) {
		pbLog(
			`Cannot add watch expressions: VS Code command "${ADD_TO_WATCH_COMMAND}" is unavailable.`
		);
		return 0;
	}

	let added = 0;
	for (const expression of expressions) {
		const commandArg: AddToWatchCommandArgument = {
			variable: {
				evaluateName: expression,
			},
		};

		try {
			await vscode.commands.executeCommand<void>(ADD_TO_WATCH_COMMAND, commandArg);
			added += 1;
			pbLog(`Added watch expression: ${expression}`);
		} catch (err) {
			pbLog(`Failed to add watch expression "${expression}": ${String(err)}`);
		}
	}

	if (added > 0) {
		pbLog(`Added ${added} watch expression(s) to the VS Code Watch panel.`);
	}

	return added;
}
