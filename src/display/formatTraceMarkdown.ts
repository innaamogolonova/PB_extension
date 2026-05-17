import * as vscode from 'vscode';
import { VariableInfo } from '../types';

function compactValue(value: string, max = 48): string {
    const oneLine = value.replace(/\s+/g, ' ').trim();
    if (oneLine.length <= max) {
        return oneLine;
    }
    return `${oneLine.slice(0, max - 1)}…`;
}

export function formatTraceHoverMarkdown(
    lineNumber: number,
    variables: VariableInfo[],
    options?: { title?: string; hint?: string }
): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportThemeIcons = true;

    const title = options?.title ?? `PB trace — line ${lineNumber}`;
    md.appendMarkdown(`### $(debug) ${title}\n\n`);

    if (variables.length === 0) {
        md.appendMarkdown('_No captured variables for this line._\n');
        return md;
    }

    md.appendMarkdown('| Variable | Value | Type |\n');
    md.appendMarkdown('| --- | --- | --- |\n');

    for (const variable of variables) {
        const safeName = variable.name.replace(/\|/g, '\\|');
        const safeValue = compactValue(variable.value).replace(/\|/g, '\\|');
        const safeType = variable.type.replace(/\|/g, '\\|');
        md.appendMarkdown(`| \`${safeName}\` | ${safeValue} | _${safeType}_ |\n`);
    }

    md.appendMarkdown('\n---\n');
    md.appendMarkdown(
        `_${variables.length} variable${variables.length === 1 ? '' : 's'} at last capture_`
    );

    if (options?.hint) {
        md.appendMarkdown(`\n\n$(info) ${options.hint}`);
    }

    return md;
}

export function formatInlineTraceSummary(variables: VariableInfo[], maxParts = 3): string {
    if (variables.length === 0) {
        return '';
    }
    return variables
        .slice(0, maxParts)
        .map((v) => `${v.name}=${compactValue(v.value, 24)}`)
        .join(' · ');
}
