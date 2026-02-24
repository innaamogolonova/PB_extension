// minimal stub to test DebugExecutor.ts 
// TODO: edit the implementation later 

import * as vscode from 'vscode';
import { ExecutionTrace } from '../types';
import { IValueTracker } from './IValueTracker';
export class DebugValueTracker implements IValueTracker {
    private filePath: string;
    private languageId: string;
    private executionStart: Date;
    constructor(filePath: string, languageId: string) {
        this.filePath = filePath;
        this.languageId = languageId;
        this.executionStart = new Date();
        
        console.log(`[DebugValueTracker] Created for ${filePath}`);
    }
    startTracking(session: vscode.DebugSession): void {
        console.log(`[DebugValueTracker] Started tracking session: ${session.id}`);
        // V1: Do nothing - just log
    }
    stopTracking(): void {
        console.log(`[DebugValueTracker] Stopped tracking`);
    }
    getTrace(): ExecutionTrace {
        console.log(`[DebugValueTracker] Returning trace`);
        
        return {
            filePath: this.filePath,
            language: this.languageId,
            lineStates: new Map(),  // Empty for V1
            executionStart: this.executionStart,
            executionEnd: new Date(),
            success: true,
            error: undefined
        };
    }
    clear(): void {
        console.log(`[DebugValueTracker] Cleared`);
    }
    dispose(): void {
        console.log(`[DebugValueTracker] Disposed`);
    }
}