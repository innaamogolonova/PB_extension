/**
 * IValueTracker defines the interface for tracking variable values during code execution.
 */

import * as vscode from 'vscode';
import { ExecutionTrace } from '../types';

export interface IValueTracker {
    
    // begins listening to debugging events from a session
    startTracking(session: vscode.DebugSession): void;

    // stops listening to debugging events and finalize data
    stopTracking(): void;

    // get all captured data 
    getTrace(): ExecutionTrace;

    // reset to initial state
    clear(): void;

}