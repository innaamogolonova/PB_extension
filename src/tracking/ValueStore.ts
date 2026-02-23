/**
 * Class that stores and retrieves variable states organized by line number 
 */

import { LineValueState, VariableInfo } from "../types";

export class ValueStore {
    private lineStates: Map<number, LineValueState>;

    constructor() {
        this.lineStates = new Map();
    }

    public setLineState(lineNumber: number, variables: VariableInfo[]): void {
        const state: LineValueState = {
            lineNumber: lineNumber,
            variables: variables,
            timestamp: Date.now()
        };
        this.lineStates.set(lineNumber, state);
    }
    
    public getLineState(lineNumber: number): LineValueState | undefined {
        return this.lineStates.get(lineNumber);
    }

    public getAllLineStates(): LineValueState[] {
        return Array.from(this.lineStates.values());
    }

    public isEmpty(): boolean {
        return this.lineStates.size === 0;
    }

    public clear(): void {
        this.lineStates.clear();
    }

}