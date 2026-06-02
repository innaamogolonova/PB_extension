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
