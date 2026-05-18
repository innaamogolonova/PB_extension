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

/** How PB collects runtime snapshots from the debugger. */
export type PbCaptureMode = 'exhaustive-step' | 'breakpoint-continue';

/** Who started the VS Code debug session PB is tied to. */
export type PbSessionRole = 'owned' | 'observed';

/** Per–debug-session policy (Phase 0 vocabulary; wired in later phases). */
export interface PbSessionPolicy {
  role: PbSessionRole;
  captureMode: PbCaptureMode;
  debugSessionId: string;
}
