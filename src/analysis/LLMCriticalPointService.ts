import * as vscode from 'vscode';
import OpenAI from 'openai';
import { CriticalPointDetector } from './CriticalPointDetector';

interface CandidateLine {
    lineNumber: number;
    code: string;
    score: number;
    variableCount: number;
}

interface SelectionWindow {
    target: number;
    min: number;
    max: number;
}

export class LLMCriticalPointService {
    private static readonly DEFAULT_MODEL = 'gpt-4o-mini';
    private static readonly DEFAULT_TARGET_RATIO = 0.35;
    private static readonly DEFAULT_MIN_RATIO = 0.25;
    private static readonly DEFAULT_MAX_RATIO = 0.50;
    private static readonly DEFAULT_MAX_CANDIDATES = 220;

    private openai?: OpenAI;
    private readonly fallbackDetector: CriticalPointDetector;
    private readonly cache = new Map<string, number[]>();

    constructor(apiKey?: string) {
        const normalizedKey = apiKey?.trim() ?? '';
        if (normalizedKey.length > 0) {
            this.openai = new OpenAI({ apiKey: normalizedKey });
        }

        this.fallbackDetector = new CriticalPointDetector();
    }

    public clearCache(): void {
        this.cache.clear();
    }

    public async detectCriticalLines(
        document: vscode.TextDocument,
        lineVariableCounts: Map<number, number>
    ): Promise<number[]> {
        const selectionWindow = this.computeSelectionWindow(
            document,
            LLMCriticalPointService.DEFAULT_TARGET_RATIO,
            LLMCriticalPointService.DEFAULT_MIN_RATIO,
            LLMCriticalPointService.DEFAULT_MAX_RATIO
        );
        const maxCandidates = LLMCriticalPointService.DEFAULT_MAX_CANDIDATES;

        const cacheKey = this.buildCacheKey(document, selectionWindow, maxCandidates);
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        const allCandidates = this.buildCandidates(document, lineVariableCounts);
        if (allCandidates.length === 0) {
            this.cache.set(cacheKey, []);
            return [];
        }

        const rankedCandidates = [...allCandidates]
            .sort((a, b) => (b.score - a.score) || (b.variableCount - a.variableCount) || (a.lineNumber - b.lineNumber));
        const candidatePool = rankedCandidates.slice(0, maxCandidates);

        const llmSelection = await this.selectLinesWithLLM(document, candidatePool, selectionWindow.target);
        if (llmSelection.failed) {
            console.error(`[LLMCriticalPointService] Falling back to regex critical point detection: ${llmSelection.reason}`);
            const fallback = this.fallbackDetector.detectCriticalLines(document);
            this.cache.set(cacheKey, fallback);
            return fallback;
        }

        const selected = this.finalizeSelection(candidatePool, llmSelection.lines, selectionWindow);

        this.cache.set(cacheKey, selected);
        return selected;
    }

    private buildCacheKey(
        document: vscode.TextDocument,
        selectionWindow: SelectionWindow,
        maxCandidates: number
    ): string {
        return [
            document.uri.toString(),
            document.version,
            'llm-default',
            selectionWindow.target,
            selectionWindow.min,
            selectionWindow.max,
            maxCandidates,
        ].join(':');
    }

    private computeSelectionWindow(
        document: vscode.TextDocument,
        targetRatio: number,
        minRatio: number,
        maxRatio: number
    ): SelectionWindow {
        const effectiveLines = this.getEffectiveLineCount(document);
        if (effectiveLines === 0) {
            return { target: 0, min: 0, max: 0 };
        }

        const min = Math.max(1, Math.round(effectiveLines * minRatio));
        const max = Math.max(min, Math.round(effectiveLines * maxRatio));
        const requestedTarget = Math.round(effectiveLines * targetRatio);
        const target = this.clampInteger(requestedTarget, min, max);

        return { target, min, max };
    }

    private getEffectiveLineCount(document: vscode.TextDocument): number {
        let count = 0;
        for (let i = 0; i < document.lineCount; i++) {
            const text = document.lineAt(i).text.trim();
            if (!this.isSkippableLine(text)) {
                count++;
            }
        }
        return count;
    }

    private buildCandidates(document: vscode.TextDocument, lineVariableCounts: Map<number, number>): CandidateLine[] {
        const candidates: CandidateLine[] = [];

        for (let i = 0; i < document.lineCount; i++) {
            const rawText = document.lineAt(i).text;
            const code = rawText.trim();
            if (this.isSkippableLine(code)) {
                continue;
            }

            const lineNumber = i + 1;
            const variableCount = lineVariableCounts.get(lineNumber) ?? 0;
            const score = this.scoreLine(code, variableCount);

            candidates.push({
                lineNumber,
                code,
                score,
                variableCount,
            });
        }

        return candidates;
    }

    private isSkippableLine(text: string): boolean {
        if (!text) {
            return true;
        }

        return /^#|^\/\/|^\/\*|^\*|^\*\//.test(text);
    }

    private scoreLine(code: string, variableCount: number): number {
        let score = 0;

        if (/^(return|yield|raise|throw)\b/.test(code)) {
            score += 5;
        }

        if (/^(if|elif|else|for|while|try|except|catch|finally|switch|case)\b/.test(code)) {
            score += 4;
        }

        if (/\b(and|or|not)\b|&&|\|\|/.test(code) || /==|!=|<=|>=|<|>/.test(code)) {
            score += 2;
        }

        if (/^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(code) || /\b[A-Za-z_][A-Za-z0-9_]*\s*[:+\-*/]?=/.test(code)) {
            score += 3;
        }

        if (/\b[A-Za-z_][A-Za-z0-9_]*\([^)]*\)/.test(code) && !/^(def|class|function)\b/.test(code)) {
            score += 2;
        }

        if (/\[[^\]]+\]/.test(code) || /\.[A-Za-z_][A-Za-z0-9_]*/.test(code)) {
            score += 1;
        }

        if (/^(def|class|function)\b/.test(code)) {
            score += 1;
        }

        if (variableCount > 0) {
            score += Math.min(3, variableCount);
        }

        return score;
    }

    private async selectLinesWithLLM(
        document: vscode.TextDocument,
        candidates: CandidateLine[],
        targetCount: number
    ): Promise<{ lines: number[]; failed: boolean; reason?: string }> {
        if (targetCount === 0 || candidates.length === 0) {
            return { lines: [], failed: false };
        }

        if (!this.openai) {
            return {
                lines: [],
                failed: true,
                reason: 'OpenAI client is not initialized. Missing API key.',
            };
        }

        const model = LLMCriticalPointService.DEFAULT_MODEL;
        const relativePath = vscode.workspace.asRelativePath(document.uri, false);

        const candidateBlock = candidates
            .map((candidate) => {
                const compactCode = candidate.code.replace(/\s+/g, ' ').slice(0, 180);
                return `L${candidate.lineNumber} | score=${candidate.score} | vars=${candidate.variableCount} | ${compactCode}`;
            })
            .join('\n');

        const prompt = [
            'Select line numbers where runtime values are most useful as inline annotations.',
            `File: ${relativePath}`,
            `Language: ${document.languageId}`,
            `Target line count: ${targetCount}`,
            'Rules:',
            '- Focus on control flow pivots, state mutations, API interactions, return/error boundaries, and complex data access.',
            '- Avoid low-signal lines that are trivial, duplicated, or purely structural.',
            '- Prefer a diverse spread through the file, not one local cluster.',
            '- Only pick from the candidate list below.',
            'Output format:',
            '- Return strict JSON only: {"selectedLines":[lineNumber,...]}',
            '- selectedLines must be ordered from highest utility to lowest utility.',
            'Candidates:',
            candidateBlock,
        ].join('\n');

        try {
            const response = await this.openai.chat.completions.create({
                model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
                max_tokens: 320,
            });

            const content = response.choices[0]?.message?.content?.trim() ?? '';
            if (!content) {
                return {
                    lines: [],
                    failed: true,
                    reason: 'LLM returned an empty response.',
                };
            }

            const parsed = this.parseLLMSelection(content, new Set(candidates.map((candidate) => candidate.lineNumber)));
            if (parsed.length === 0) {
                return {
                    lines: [],
                    failed: true,
                    reason: 'LLM response could not be parsed into candidate line numbers.',
                };
            }

            return { lines: parsed, failed: false };
        } catch (error) {
            console.error('[LLMCriticalPointService] Error selecting lines:', error);
            return {
                lines: [],
                failed: true,
                reason: 'LLM request failed.',
            };
        }
    }

    private parseLLMSelection(content: string, allowedLines: Set<number>): number[] {
        if (!content) {
            return [];
        }

        try {
            const parsed = JSON.parse(content) as { selectedLines?: unknown } | unknown[];

            const rawLines = Array.isArray(parsed)
                ? parsed
                : Array.isArray((parsed as { selectedLines?: unknown }).selectedLines)
                    ? (parsed as { selectedLines: unknown[] }).selectedLines
                    : [];

            const selected = rawLines
                .map((value) => Number(value))
                .filter((value) => Number.isInteger(value) && allowedLines.has(value));

            return this.uniquePreserveOrder(selected);
        } catch {
            const numericMatches = content.match(/\d+/g) ?? [];
            const parsed = numericMatches
                .map((token) => Number(token))
                .filter((value) => Number.isInteger(value) && allowedLines.has(value));

            return this.uniquePreserveOrder(parsed);
        }
    }

    private finalizeSelection(
        rankedCandidates: CandidateLine[],
        llmSelected: number[],
        selectionWindow: SelectionWindow
    ): number[] {
        if (selectionWindow.target === 0 || rankedCandidates.length === 0) {
            return [];
        }

        const candidateByLine = new Map<number, CandidateLine>();
        for (const candidate of rankedCandidates) {
            candidateByLine.set(candidate.lineNumber, candidate);
        }

        const selected = new Set<number>();
        const orderedLLM = llmSelected.filter((line) => candidateByLine.has(line));

        for (const line of orderedLLM) {
            if (selected.size >= selectionWindow.max) {
                break;
            }
            selected.add(line);
        }

        this.fillFromHeuristics(selected, rankedCandidates, selectionWindow.min, 1);
        this.fillFromHeuristics(selected, rankedCandidates, selectionWindow.target, 1);

        if (selected.size < selectionWindow.target) {
            this.fillFromHeuristics(selected, rankedCandidates, selectionWindow.target, 0);
        }

        if (selected.size > selectionWindow.max) {
            const sortedByPriority = [...selected].sort((a, b) => {
                const scoreA = candidateByLine.get(a)?.score ?? 0;
                const scoreB = candidateByLine.get(b)?.score ?? 0;
                return scoreB - scoreA;
            });
            const clamped = sortedByPriority.slice(0, selectionWindow.max);
            return clamped.sort((a, b) => a - b);
        }

        if (selected.size === 0) {
            selected.add(rankedCandidates[0].lineNumber);
        }

        return [...selected].sort((a, b) => a - b);
    }

    private fillFromHeuristics(
        selected: Set<number>,
        rankedCandidates: CandidateLine[],
        desiredCount: number,
        minGap: number
    ): void {
        if (selected.size >= desiredCount) {
            return;
        }

        for (const candidate of rankedCandidates) {
            if (selected.size >= desiredCount) {
                break;
            }

            if (selected.has(candidate.lineNumber)) {
                continue;
            }

            if (!this.respectsGap(selected, candidate.lineNumber, minGap)) {
                continue;
            }

            selected.add(candidate.lineNumber);
        }
    }

    private respectsGap(selected: Set<number>, lineNumber: number, minGap: number): boolean {
        if (minGap <= 0 || selected.size === 0) {
            return true;
        }

        for (const selectedLine of selected) {
            if (Math.abs(selectedLine - lineNumber) <= minGap) {
                return false;
            }
        }

        return true;
    }

    private uniquePreserveOrder(values: number[]): number[] {
        const seen = new Set<number>();
        const result: number[] = [];

        for (const value of values) {
            if (seen.has(value)) {
                continue;
            }

            seen.add(value);
            result.push(value);
        }

        return result;
    }

    private clampRatio(value: number, min: number, max: number): number {
        if (Number.isNaN(value)) {
            return min;
        }

        return Math.min(max, Math.max(min, value));
    }

    private clampInteger(value: number, min: number, max: number): number {
        if (Number.isNaN(value)) {
            return min;
        }

        const rounded = Math.round(value);
        return Math.min(max, Math.max(min, rounded));
    }
}
