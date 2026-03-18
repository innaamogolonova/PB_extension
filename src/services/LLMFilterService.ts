import OpenAI from 'openai';
import { VariableInfo } from '../types';

export class LLMFilterService {
    private openai: OpenAI;
    private cache: Map<string, string[]>;
    private static readonly MAX_RETURNED_VARIABLES = 4;
    private static readonly MAX_VALUE_LENGTH = 40;

    constructor(apiKey: string) {
        this.openai = new OpenAI({ apiKey });
        this.cache = new Map<string, string[]>();
    }

    public async getRelevantVariables(
        lineNumber: number,
        lineCode: string,
        allVariables: VariableInfo[],
        context?: string
    ): Promise<VariableInfo[]> {
        const cacheKey = `${lineNumber}:${lineCode}:${context ?? ''}`;

        if (this.cache.has(cacheKey)) {
            const cachedNames = this.cache.get(cacheKey)!;
            return allVariables.filter((variable) => cachedNames.includes(variable.name));
        }

        if (allVariables.length === 0) {
            this.cache.set(cacheKey, []);
            return [];
        }

        const variableList = allVariables
            .map((variable) => `- ${variable.name}: ${variable.value} (${variable.type})`)
            .join('\n');

        const contextBlock = context ? `\nContext:\n${context}` : '';

        const prompt = `
            You are selecting which runtime values to show as an inline debug hint.

            Goal:
            - Return the shortest, most informative values for this exact line.
            - Prioritize variables that directly affect control flow, comparisons, indexing, return values, and API calls on this line.
            - Use semantic context (file/function/nearby lines) to infer intent.
            - Keep output concise for inline display.

            Input line:
            Line ${lineNumber}: ${lineCode}

            Available variables:
            ${variableList}${contextBlock}

            Selection rules:
            1) Return 1-4 selectors, only as needed.
            2) Prefer atomic values over whole containers.
            3) If a list/map/object is relevant, return a precise entry selector instead of the full variable, e.g. items[2], user["id"], config["timeout"].
            4) Avoid obvious/uninformative loop counters unless they are critical.
            5) Do not include explanations.

            Output format (strict):
            - ONLY a comma-separated list of selectors
            - No prose, no markdown, no extra punctuation

            Example:
            result, request["status"], items[3]`;

        try {
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.2,
                max_tokens: 80,
            });

            const content = response.choices[0]?.message?.content?.trim() || '';
            const relevantSelectors = content
                .split(',')
                .map((name) => name.trim().replace(/^['"`\s]+|['"`\s]+$/g, ''))
                .filter((name) => name.length > 0)
                .slice(0, LLMFilterService.MAX_RETURNED_VARIABLES);

            this.cache.set(cacheKey, relevantSelectors);

            const selectedVariables = this.resolveSelectedVariables(relevantSelectors, allVariables);
            if (selectedVariables.length > 0) {
                return selectedVariables;
            }

            return allVariables.slice(0, 2).map((variable) => ({
                ...variable,
                value: this.compactValue(variable.value)
            }));
        } catch (error) {
            console.error('[LLMFilterService] Error:', error);
            return allVariables.slice(0, 2).map((variable) => ({
                ...variable,
                value: this.compactValue(variable.value)
            }));
        }
    }

    public clearCache(): void {
        this.cache.clear();
    }

    private resolveSelectedVariables(selectors: string[], allVariables: VariableInfo[]): VariableInfo[] {
        const selected: VariableInfo[] = [];
        const usedNames = new Set<string>();

        for (const selector of selectors) {
            const baseNameMatch = selector.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
            const baseName = baseNameMatch?.[1] ?? null;
            if (!baseName) {
                continue;
            }

            const baseVariable = allVariables.find((variable) => variable.name === baseName);
            if (!baseVariable) {
                continue;
            }

            if (!selector.includes('[')) {
                if (usedNames.has(baseVariable.name)) {
                    continue;
                }

                selected.push({
                    ...baseVariable,
                    value: this.compactValue(baseVariable.value)
                });
                usedNames.add(baseVariable.name);
                continue;
            }

            const extracted = this.extractSelectedEntry(baseVariable.value, selector);
            if (extracted === undefined) {
                if (usedNames.has(baseVariable.name)) {
                    continue;
                }

                selected.push({
                    ...baseVariable,
                    value: this.compactValue(baseVariable.value)
                });
                usedNames.add(baseVariable.name);
                continue;
            }

            selected.push({
                name: selector,
                type: baseVariable.type,
                value: this.compactValue(
                    typeof extracted === 'string'
                        ? extracted
                        : extracted === null || extracted === undefined
                            ? String(extracted)
                            : typeof extracted === 'number' || typeof extracted === 'boolean'
                                ? String(extracted)
                                : (() => {
                                      try {
                                          return JSON.stringify(extracted);
                                      } catch {
                                          return String(extracted);
                                      }
                                  })()
                )
            });

            usedNames.add(selector);
        }

        return selected.slice(0, LLMFilterService.MAX_RETURNED_VARIABLES);
    }

    private extractSelectedEntry(rawValue: string, selector: string): unknown {
        const trimmed = rawValue.trim();
        if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {
            return undefined;
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(trimmed);
        } catch {
            const normalized = trimmed
                .replace(/\bTrue\b/g, 'true')
                .replace(/\bFalse\b/g, 'false')
                .replace(/\bNone\b/g, 'null')
                .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_match, group: string) => {
                    const escaped = group.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                    return `"${escaped}"`;
                });

            try {
                parsed = JSON.parse(normalized);
            } catch {
                return undefined;
            }
        }

        const tokens: string[] = [];
        const tokenRegex = /\[([^\]]+)\]/g;
        let match: RegExpExecArray | null;
        while ((match = tokenRegex.exec(selector)) !== null) {
            const raw = match[1].trim();
            tokens.push(raw.replace(/^['"`\s]+|['"`\s]+$/g, ''));
        }

        if (parsed === undefined) {
            return undefined;
        }

        if (tokens.length === 0) {
            return undefined;
        }

        let current: unknown = parsed;
        for (const token of tokens) {
            if (Array.isArray(current)) {
                const index = Number(token);
                if (!Number.isInteger(index) || index < 0 || index >= current.length) {
                    return undefined;
                }
                current = current[index];
                continue;
            }

            if (current !== null && typeof current === 'object') {
                const record = current as Record<string, unknown>;
                if (!(token in record)) {
                    return undefined;
                }
                current = record[token];
                continue;
            }

            return undefined;
        }

        return current;
    }

    private compactValue(raw: string): string {
        const singleLine = raw.replace(/\s+/g, ' ').trim();
        if (singleLine.length <= LLMFilterService.MAX_VALUE_LENGTH) {
            return singleLine;
        }

        return `${singleLine.slice(0, LLMFilterService.MAX_VALUE_LENGTH - 1)}…`;
    }
}