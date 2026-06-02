/** How PB collects runtime snapshots from the debugger (later phases). */
export type PbCaptureMode = 'exhaustive-step' | 'breakpoint-continue';

// --- LLM context (Step 3+) ---

export interface UserBugSpec {
	description: string;
}

export interface SourceSelection {
	/** 1-based inclusive */
	startLine: number;
	/** 1-based inclusive */
	endLine: number;
}

export interface NumberedLine {
	/** 1-based */
	lineNumber: number;
	text: string;
}

export interface SourceContext {
	filePath: string;
	workspaceRelativePath?: string;
	languageId: string;
	content: string;
	lineCount: number;
	numberedLines: NumberedLine[];
	selection?: SourceSelection;
	isDirty?: boolean;
}

export interface CaptureSite {
	line: number;
	kind: string;
}

export interface GatheredContext {
	user: UserBugSpec;
	source: SourceContext | null;
	captureSites: CaptureSite[];
	warnings: string[];
}

// --- LLM debugger plan (Step 4+; consumed by launch + breakpoint apply) ---

export type PlannedBreakpointKind = 'line' | 'conditional' | 'logpoint';

export interface PlannedBreakpoint {
	/** 1-based line number */
	line: number;
	kind: PlannedBreakpointKind;
	condition?: string;
	logMessage?: string;
	rationale?: string;
}

/** Structured plan for debugpy launch and breakpoint application (Steps 5–6). */
export interface DebuggerSetupPlan {
	filePath: string;
	workspaceRelativePath?: string;
	breakpoints: PlannedBreakpoint[];
	watchExpressions: string[];
	summary?: string;
}
