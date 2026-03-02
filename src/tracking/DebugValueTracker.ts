/**
 * DebugValueTracker is responsible for tracking variable values during a debug session in an event-driven manner.
*/

import * as vscode from 'vscode';
import { ExecutionTrace, LineValueState, VariableInfo } from '../types';
import { IValueTracker } from './IValueTracker';
import { ValueStore } from './ValueStore';

export class DebugValueTracker implements IValueTracker {
    private filePath: string;
    private languageId: string;
    private currentSession?: vscode.DebugSession;
    private valueStore: ValueStore; 
    private disposables: vscode.Disposable[];
    private executionStart: Date;
    private executionEnd?: Date;
    private isTracking: boolean;
    private lastError?: string;

    constructor(filePath: string, languageId: string) {
        this.filePath = filePath;
        this.languageId = languageId;
        this.valueStore = new ValueStore();
        this.disposables = [];
        this.isTracking = false;
        this.executionStart = new Date();
        
        console.log(`[DebugValueTracker] Created for ${filePath}`);
    }

    public startTracking(session: vscode.DebugSession): void {
        this.currentSession = session;
        this.isTracking = true;

        const disposable = vscode.debug.onDidReceiveDebugSessionCustomEvent((event) => {
            if (event.session.id === this.currentSession?.id) {
                if (event.event === 'stopped') {
                    this.captureVariablesAtCurrentLine(event);
                }
            }
        });

        this.disposables.push(disposable);

        console.log(`[DebugValueTracker] Started tracking session: ${session.id}`);

    }

    private async captureVariablesAtCurrentLine(event: vscode.DebugSessionCustomEvent): Promise<void> {
        try {
            const threadId = event.body.threadId;
            const {frameId, lineNumber} = await this.getStackTrace(threadId);
            const scopes = await this.getScopes(frameId);
            
            const allVariables: VariableInfo[] = [];
            for (const scope of scopes) {
                const variables = await this.getVariablesInScope(scope);
                allVariables.push(...variables); 
            }
            
            this.valueStore.setLineState(lineNumber, allVariables);

        } catch (err) {
            const errorMsg = `Failed to capture variables: ${err}`;
            console.error(`[DebugValueTracker] ${errorMsg}`);
            this.lastError = errorMsg;
        }
    }

    private async getStackTrace(threadId: number): Promise<{ frameId: number, lineNumber: number }> {
        if (!this.currentSession) {
            throw new Error('getStackTrace: No active debug session');
        }
                
        const response = await this.currentSession.customRequest('stackTrace', { 
            threadId, 
            startFrame: 0, 
            levels: 1 
        });
        
        const frame = response.stackFrames[0];
        const result = { frameId: frame.id, lineNumber: frame.line };
                
        return result;
    }

    private async getScopes(frameId: number): Promise<any[]> {
        if (!this.currentSession) {
            throw new Error('getScope: No active debug session');
        }

        const response = await this.currentSession.customRequest('scopes', { frameId });
        
        return response.scopes;
    }

    private async getVariablesInScope(scope: any): Promise<VariableInfo[]> {
        if (!this.currentSession) {
            throw new Error('getVariablesInScope: No active debug session');
        }

        // let type: 'local' | 'global' | 'parameter' = 'local'; 
        // switch (scope.name) {
        //     case 'Locals':
        //     case 'locals':
        //         type = 'local';
        //         break;
        //     case 'Globals':
        //     case 'globals':
        //         type = 'global';
        //         break;
        //     case 'Arguments':
        //     case 'arguments':
        //         type = 'parameter';
        //         break;
        //     default:
        //         type = 'local';
        // }

        const response = await this.currentSession.customRequest('variables', { 
            variablesReference: scope.variablesReference 
        });

        const variables: VariableInfo[] = [];
        for (const variable of response.variables) {
            const varInfo: VariableInfo = {
                name: variable.name,
                value: variable.value,  // Already a string
                type: variable.type,
                // scope: type
            };
            
            variables.push(varInfo);
                        
            // TODO: Expand nested objects in V3
            // if (variable.variablesReference > 0) { ... }
        }

        return variables;
    }

    public async captureAtCurrentPosition(threadId: number): Promise<void> {
        try {
            const {frameId, lineNumber} = await this.getStackTrace(threadId);
            const scopes = await this.getScopes(frameId);
            
            const allVariables: VariableInfo[] = [];
            for (const scope of scopes) {
                const variables = await this.getVariablesInScope(scope);
                allVariables.push(...variables); 
            }
            
            console.log(`[DebugValueTracker] Captured ${allVariables.length} variables at line ${lineNumber}`);
            this.valueStore.setLineState(lineNumber, allVariables);

        } catch (err) {
            const errorMsg = `Failed to capture variables: ${err}`;
            console.error(`[DebugValueTracker] ${errorMsg}`);
            this.lastError = errorMsg;
        }
    }

    stopTracking(): void {
        this.isTracking = false;

        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];

        if (this.executionEnd === undefined) {
            this.executionEnd = new Date();
        }

        this.currentSession = undefined;

        console.log(`[DebugValueTracker] Stopped tracking`);
    }

    getTrace(): ExecutionTrace {
        this.executionEnd = new Date();
        
        const array = this.valueStore.getAllLineStates(); 
        const map = new Map<number, LineValueState>();
        for (const lineState of array) {
            map.set(lineState.lineNumber, lineState);
        }
        
        const success = this.lastError === undefined;

        return {
            filePath: this.filePath,
            language: this.languageId,
            lineStates: map, 
            executionStart: this.executionStart,
            executionEnd: this.executionEnd,
            success: success,
            error: this.lastError
        };
    }

    clear(): void {
        this.valueStore.clear();
        this.executionStart = new Date();
        this.executionEnd = undefined;
        this.lastError = undefined;
        
        console.log(`[DebugValueTracker] Cleared tracker state`);
    }

    dispose(): void {
        this.stopTracking();
        this.valueStore.clear();
    }
}