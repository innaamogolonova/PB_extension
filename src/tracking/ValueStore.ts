/**
 * Class that stores and retrieves variable states organized by line number 
 */

import { LineValueState, VariableInfo } from "../types";

export class ValueStore {
    // Change to store array of states per line
    private states: Map<number, LineValueState[]> = new Map();

    public setLineState(lineNumber: number, variables: VariableInfo[]): void {
        const state: LineValueState = {
            lineNumber,
            variables,
            timestamp: Date.now()
        };
        
        // Get existing states for this line or create new array
        const existingStates = this.states.get(lineNumber) || [];
        existingStates.push(state);  // Add new state to array
        this.states.set(lineNumber, existingStates);
    }

    public getAllLineStates(): LineValueState[] {
        // Flatten all states into single array
        const allStates: LineValueState[] = [];
        for (const stateArray of this.states.values()) {
            allStates.push(...stateArray);
        }
        return allStates;
    }

    public clear(): void {
        this.states.clear();
    }
}