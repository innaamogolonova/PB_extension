import { ILanguageExecutor } from "./ILanguageExecutor";

export class LanguageRegistry {
    private executors: Map<string, ILanguageExecutor> = new Map();

    constructor() {
        this.executors = new Map();
    }    

    public register(languageId: string, executor: ILanguageExecutor): void {
        this.executors.set(languageId, executor);
    }

    public getExecutor(filePath: string): ILanguageExecutor | undefined {
        for (const executor of this.executors.values()) {
            if (executor.canExecute(filePath)) {
                return executor;
            }
        }
        return undefined;
    }

    public isSupported(filePath: string): boolean {
        return this.getExecutor(filePath) !== undefined;
    }

    public dispose(): void {   
        this.executors.forEach(executor => executor.dispose());
        this.executors.clear();
    }
}