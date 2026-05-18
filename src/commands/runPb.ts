import * as path from 'path';
import * as vscode from 'vscode';
import { mkdir, writeFile } from 'node:fs/promises';
import { getCaptureMode, getPythonDebugAdapterType } from '../config';
import { DebugExecutor } from '../execution/DebugExecutor';
import { AnnotationsProvider } from '../display/AnnotationsProvider';
import { PbTraceCodeLensProvider } from '../display/PbTraceCodeLensProvider';
import { refreshTraceDisplay } from '../display/refreshTraceDisplay';
import { SessionOrchestrator } from '../orchestration/SessionOrchestrator';
import { TraceManager } from '../tracking/TraceManager';

export interface RunPbContext {
    traceManager: TraceManager;
    sessionOrchestrator: SessionOrchestrator | undefined;
    annotationsProvider: AnnotationsProvider;
    pbTraceCodeLensProvider: PbTraceCodeLensProvider | undefined;
}

function getActivePythonFilePath(): string | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        void vscode.window.showErrorMessage('Open a Python file to run PB.');
        return undefined;
    }

    const filePath = editor.document.uri.fsPath;
    if (
        editor.document.languageId !== 'python' &&
        !filePath.endsWith('.py') &&
        !filePath.endsWith('.pyw')
    ) {
        void vscode.window.showErrorMessage('Active file is not Python.');
        return undefined;
    }

    return filePath;
}

async function runOwnedExhaustive(filePath: string, ctx: RunPbContext): Promise<void> {
    const executor = new DebugExecutor('python', getPythonDebugAdapterType(), ctx.traceManager);
    const onCaptured = (capturedPath: string) => {
        void refreshTraceDisplay(
            ctx.traceManager,
            ctx.annotationsProvider,
            ctx.pbTraceCodeLensProvider,
            capturedPath
        );
    };

    try {
        void vscode.window.showInformationMessage('PB: running exhaustive trace…');
        const trace = await executor.execute(filePath, {
            captureMode: 'exhaustive-step',
            onCaptured
        });

        ctx.traceManager.pinActiveSessionForFile(filePath);
        await refreshTraceDisplay(
            ctx.traceManager,
            ctx.annotationsProvider,
            ctx.pbTraceCodeLensProvider,
            filePath
        );

        const lineCount = trace.lineStates.size;
        void vscode.window.showInformationMessage(
            `PB exhaustive trace finished — ${lineCount} line(s) with captures.`
        );
    } catch (err) {
        void vscode.window.showErrorMessage(`PB exhaustive trace failed: ${err}`);
    } finally {
        executor.dispose();
    }
}

/**
 * Main Run PB — uses `pbExtension.captureMode` (default: breakpoint-continue).
 */
export async function runPb(ctx: RunPbContext): Promise<void> {
    const filePath = getActivePythonFilePath();
    if (!filePath) {
        return;
    }

    const mode = getCaptureMode();

    if (mode === 'breakpoint-continue') {
        if (!ctx.sessionOrchestrator) {
            void vscode.window.showErrorMessage('PB session orchestrator is not available.');
            return;
        }
        await ctx.sessionOrchestrator.debugCurrentPythonFileWithTracing();
        return;
    }

    await runOwnedExhaustive(filePath, ctx);
}

/**
 * Exhaustive trace — always steps through the debugger (ignores captureMode setting).
 */
export async function runPbExhaustive(ctx: RunPbContext): Promise<void> {
    const filePath = getActivePythonFilePath();
    if (!filePath) {
        return;
    }

    await runOwnedExhaustive(filePath, ctx);
}

/**
 * Optional dev helper: exhaustive run + JSON export to workspace traces/.
 */
export async function runPbExhaustiveWithJsonExport(ctx: RunPbContext): Promise<void> {
    const filePath = getActivePythonFilePath();
    if (!filePath) {
        return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        void vscode.window.showErrorMessage('Open a workspace folder to export traces.');
        return;
    }

    const executor = new DebugExecutor('python', getPythonDebugAdapterType(), ctx.traceManager);

    try {
        const trace = await executor.execute(filePath, { captureMode: 'exhaustive-step' });
        await refreshTraceDisplay(
            ctx.traceManager,
            ctx.annotationsProvider,
            ctx.pbTraceCodeLensProvider,
            filePath
        );

        const projectFolder = path.join(workspaceFolder.uri.fsPath, 'traces');
        await mkdir(projectFolder, { recursive: true });

        const fileName = path.basename(filePath, path.extname(filePath));
        const fullTracePath = path.join(projectFolder, `${fileName}_trace.json`);
        await writeFile(fullTracePath, JSON.stringify(DebugExecutor.traceToJSON(trace), null, 2), 'utf-8');

        void vscode.window.showInformationMessage(`PB trace saved to ${fullTracePath}`);
    } catch (err) {
        void vscode.window.showErrorMessage(`PB trace export failed: ${err}`);
    } finally {
        executor.dispose();
    }
}
