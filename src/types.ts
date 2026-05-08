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
  lineStates: Map<number, LineValueState[]>;
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

export interface CapturedFrameState extends LineValueState {
  frameFilePath: string;
  frameId: number;
  threadId: number;
  functionName?: string;
}

export interface FileTrace {
  filePath: string;
  language: string;
  lineStates: Map<number, CapturedFrameState[]>;
  sourceHash?: string;
  capturedAt: number;
  isStale: boolean;
}

export interface TraceSession {
  sessionId: string;
  entryPoint: string;
  language: string;
  files: Map<string, FileTrace>;
  executionStart: Date;
  executionEnd?: Date;
  success: boolean;
  error?: string;
}
