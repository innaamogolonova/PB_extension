import * as vscode from 'vscode';
import { PbCaptureMode } from './types';

const CAPTURE_MODE_KEY = 'captureMode';
const DEFAULT_CAPTURE_MODE: PbCaptureMode = 'exhaustive-step';

/** Modern VS Code Python debugging uses debugpy; legacy configs use python. */
export function getPythonDebugAdapterType(): string {
    return 'debugpy';
}

/**
 * How PB collects runtime snapshots from the debugger.
 * Phase 0: read-only; execution still uses exhaustive-step regardless of value
 * until breakpoint capture is implemented (Phase 4).
 */
export function getCaptureMode(): PbCaptureMode {
    const config = vscode.workspace.getConfiguration('pbExtension');
    const mode = config.get<PbCaptureMode>(CAPTURE_MODE_KEY, DEFAULT_CAPTURE_MODE);
    if (mode === 'exhaustive-step' || mode === 'breakpoint-continue') {
        return mode;
    }
    return DEFAULT_CAPTURE_MODE;
}
