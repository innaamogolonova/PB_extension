import * as vscode from 'vscode';
import { PbCaptureMode } from './types';

const CAPTURE_MODE_KEY = 'captureMode';
const DEFAULT_CAPTURE_MODE: PbCaptureMode = 'exhaustive-step';

export type CaptureSiteDetectorMode = 'regex' | 'ast' | 'ast-with-regex-fallback';

const CAPTURE_SITE_DETECTOR_KEY = 'captureSiteDetector';
const DEFAULT_CAPTURE_SITE_DETECTOR: CaptureSiteDetectorMode = 'ast-with-regex-fallback';
const PYTHON_INTERPRETER_KEY = 'pythonInterpreter';
const MAX_LOOP_CAPTURE_SITES_KEY = 'maxLoopCaptureSitesPerFile';
const DEFAULT_MAX_LOOP_CAPTURE_SITES = 20;

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

export function getCaptureSiteDetectorMode(): CaptureSiteDetectorMode {
    const config = vscode.workspace.getConfiguration('pbExtension');
    const mode = config.get<CaptureSiteDetectorMode>(
        CAPTURE_SITE_DETECTOR_KEY,
        DEFAULT_CAPTURE_SITE_DETECTOR
    );
    if (mode === 'regex' || mode === 'ast' || mode === 'ast-with-regex-fallback') {
        return mode;
    }
    return DEFAULT_CAPTURE_SITE_DETECTOR;
}

export function getPythonInterpreter(): string {
    const config = vscode.workspace.getConfiguration('pbExtension');
    const configured = config.get<string>(PYTHON_INTERPRETER_KEY, '').trim();
    return configured.length > 0 ? configured : 'python3';
}

export function getMaxLoopCaptureSitesPerFile(): number {
    const config = vscode.workspace.getConfiguration('pbExtension');
    const value = config.get<number>(MAX_LOOP_CAPTURE_SITES_KEY, DEFAULT_MAX_LOOP_CAPTURE_SITES);
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return DEFAULT_MAX_LOOP_CAPTURE_SITES;
    }
    return Math.max(0, Math.floor(value));
}
