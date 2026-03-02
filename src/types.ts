import * as vscode from 'vscode';

// Interface for display strategies.
export interface IDisplayStrategy {
  activate(context: vscode.ExtensionContext): void;
  deactivate(): void;
  refresh(editor: vscode.TextEditor): Promise<void>;
}

// Add new types
export interface VariableInfo {
  name: string;
  value: string;
  type: string;
}
export interface LineValueState {
  lineNumber: number;
  variables: VariableInfo[];
  timestamp: number;
}
export interface ExecutionTrace {
  filePath: string;
  language: string;
  lineStates: Map<number, LineValueState>;
  executionStart: Date;
  executionEnd?: Date;
  success: boolean;
  error?: string;
}
// For webview display
export interface ValueDisplayContent {
  filePath: string;
  lineStates: LineValueState[];
  isLoading: boolean;
}