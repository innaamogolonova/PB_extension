/**
 * Class that stores and retrieves variable states organized by line number 
 */

import { CapturedFrameState, VariableInfo } from "../types";

interface FrameMetadata {
    frameId: number;
    threadId: number;
    functionName?: string;
}

export class ValueStore {
    private states: Map<string, Map<number, CapturedFrameState[]>> = new Map();

    public setLineState(filePath: string, lineNumber: number, variables: VariableInfo[], metadata: FrameMetadata): void {
        const state: CapturedFrameState = {
            lineNumber,
            variables,
            timestamp: Date.now(),
            frameFilePath: filePath,
            frameId: metadata.frameId,
            threadId: metadata.threadId,
            functionName: metadata.functionName
        };

        const fileStates = this.states.get(filePath) ?? new Map<number, CapturedFrameState[]>();
        const existingStates = fileStates.get(lineNumber) ?? [];
        existingStates.push(state);
        fileStates.set(lineNumber, existingStates);
        this.states.set(filePath, fileStates);
    }

    public getLatestVariables(filePath: string, lineNumber: number): VariableInfo[] {
        const fileStates = this.states.get(filePath);
        if (!fileStates) {
            return [];
        }

        const statesForLine = fileStates.get(lineNumber);
        if (!statesForLine || statesForLine.length === 0) {
            return [];
        }

        return statesForLine[statesForLine.length - 1].variables;
    }

    public getLineStatesForFile(filePath: string): Map<number, CapturedFrameState[]> {
        const fileStates = this.states.get(filePath);
        if (!fileStates) {
            return new Map<number, CapturedFrameState[]>();
        }

        return new Map<number, CapturedFrameState[]>(fileStates);
    }

    public getAllFiles(): string[] {
        return Array.from(this.states.keys());
    }

    public clearFile(filePath: string): void {
        this.states.delete(filePath);
    }

    public clear(): void {
        this.states.clear();
    }
}
