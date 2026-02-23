/**
 * ILanguageExecutor defines the interface for executing code in a specific programming language
 * and retrieving execution traces (variable values, line states, etc.).
 */


import * as vscode from 'vscode';
import { ExecutionTrace } from '../types';

export interface ILanguageExecutor {

    // executes file and returns all tracked data (variables) 
    execute(filePath: string): Promise<ExecutionTrace>; 

    // checks if the file can be executed (e.g. correct language)
    canExecute(filePath: string): boolean; 

    // tells which language is being handled
    getLanguageId(): string;

    // called when extension deactivates for proper cleanup 
    dispose(): void;
}