import OpenAI from 'openai';
import { VariableInfo } from '../types';

export class LLMFilterService {
    private openai: OpenAI;
    private cache: Map<string, string[]>;

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
        const cacheKey = `${lineNumber}:${lineCode}`;

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
            You are analyzing code execution traces.
            Given this line of code and available variables, identify the 1-2 most relevant variables for debugging.
            Line ${lineNumber}: ${lineCode}
            Available variables at this line:
            ${variableList}${contextBlock}

            Return ONLY the variable name(s) as a comma-separated list. Be concise.
            Example: "result, count"`;

        try {
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 50,
            });

            const content = response.choices[0]?.message?.content?.trim() || '';
            const relevantNames = content
                .split(',')
                .map((name) => name.trim().replace(/^['"`\s]+|['"`\s]+$/g, ''))
                .filter((name) => name.length > 0);

            this.cache.set(cacheKey, relevantNames);

            return allVariables.filter((variable) => relevantNames.includes(variable.name));
        } catch (error) {
            console.error('[LLMFilterService] Error:', error);
            return allVariables.slice(0, 2);
        }
    }

    public clearCache(): void {
        this.cache.clear();
    }
}