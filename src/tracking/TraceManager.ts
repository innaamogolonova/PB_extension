import { ExecutionTrace, VariableInfo } from "../types";

export class TraceManager {
    private currentTrace?: ExecutionTrace;

    public setTrace(trace: ExecutionTrace): void {
        this.currentTrace = trace;
    }

    public getVariablesForLine(lineNumber: number): VariableInfo[] {
        if (!this.currentTrace) {
            return [];
        }
        const lineStates = this.currentTrace.lineStates.get(lineNumber);
        return lineStates ? lineStates[lineStates.length - 1].variables : [];
    }

    public getCriticalPoints(): number[] {
        if (!this.currentTrace) {
            return [];
        }
        const lineNumbers = Array.from(this.currentTrace.lineStates.keys());
        return lineNumbers; 
    }

    public getFullTrace(): ExecutionTrace | undefined {
        return this.currentTrace;
    }

    public clear(): void {
        this.currentTrace = undefined;
    }
}