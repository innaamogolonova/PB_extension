import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
    getMaxLoopCaptureSitesPerFile,
    getPythonInterpreter,
    getCaptureSiteDetectorMode
} from '../config';
import { pbLog } from '../pbOutput';
import {
    CaptureSite,
    finalizeCaptureSites,
    getCaptureSitePolicyVersion,
    isSiteKind,
    SiteKind
} from './captureSites';
import { detectRegexCaptureSites } from './regexCaptureSites';
import { normalizeSourcePath } from '../orchestration/pathUtils';

const AST_TIMEOUT_MS = 10_000;
const SCRIPT_RELATIVE = path.join('scripts', 'detect_capture_sites.py');

interface CacheEntry {
    policyVersion: string;
    mtimeMs: number;
    sites: CaptureSite[];
    source: 'ast' | 'regex';
}

interface AstScriptPayload {
    sites?: Array<{ line?: number; kind?: string }>;
    error?: string;
    message?: string;
}

export class AstCaptureSiteProvider {
    private extensionPath?: string;
    private readonly cache = new Map<string, CacheEntry>();
    private readonly fallbackLogged = new Set<string>();

    public initialize(context: vscode.ExtensionContext): void {
        this.extensionPath = context.extensionPath;

        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument((event) => {
                if (event.document.uri.scheme === 'file' && event.document.languageId === 'python') {
                    this.invalidateFile(event.document.uri.fsPath);
                }
            }),
            vscode.workspace.onDidSaveTextDocument((doc) => {
                if (doc.uri.scheme === 'file' && doc.languageId === 'python') {
                    this.invalidateFile(doc.uri.fsPath);
                }
            })
        );
    }

    public invalidateFile(fsPath: string): void {
        this.cache.delete(normalizeSourcePath(fsPath));
    }

    public async detectCaptureSites(document: vscode.TextDocument): Promise<CaptureSite[]> {
        const mode = getCaptureSiteDetectorMode();

        if (mode === 'regex') {
            return finalizeCaptureSites(
                detectRegexCaptureSites(document),
                getMaxLoopCaptureSitesPerFile()
            );
        }

        const filePath = normalizeSourcePath(document.uri.fsPath);
        const cached = this.getCached(filePath);
        if (cached) {
            return cached.sites;
        }

        const astResult = await this.runAstDetector(filePath);
        if (astResult.ok) {
            const sites = finalizeCaptureSites(astResult.sites, getMaxLoopCaptureSitesPerFile());
            this.setCache(filePath, sites, 'ast', astResult.mtimeMs);
            return sites;
        }

        if (mode === 'ast') {
            pbLog(`AST capture sites failed for ${filePath}: ${astResult.error} (no fallback)`);
            return [];
        }

        if (!this.fallbackLogged.has(filePath)) {
            this.fallbackLogged.add(filePath);
            pbLog(`AST capture sites failed for ${filePath}: ${astResult.error}; using regex fallback`);
        }

        const sites = finalizeCaptureSites(
            detectRegexCaptureSites(document),
            getMaxLoopCaptureSitesPerFile()
        );
        this.setCache(filePath, sites, 'regex', astResult.mtimeMs);
        return sites;
    }

    private getCached(filePath: string): CacheEntry | undefined {
        let mtimeMs: number;
        try {
            mtimeMs = fs.statSync(filePath).mtimeMs;
        } catch {
            return undefined;
        }

        const entry = this.cache.get(filePath);
        if (
            entry &&
            entry.mtimeMs === mtimeMs &&
            entry.policyVersion === getCaptureSitePolicyVersion()
        ) {
            return entry;
        }
        return undefined;
    }

    private setCache(
        filePath: string,
        sites: CaptureSite[],
        source: 'ast' | 'regex',
        mtimeMs: number
    ): void {
        this.cache.set(filePath, {
            sites,
            source,
            mtimeMs,
            policyVersion: getCaptureSitePolicyVersion()
        });
    }

    private getScriptPath(): string | undefined {
        if (!this.extensionPath) {
            return undefined;
        }
        const scriptPath = path.join(this.extensionPath, SCRIPT_RELATIVE);
        return fs.existsSync(scriptPath) ? scriptPath : undefined;
    }

    private async runAstDetector(
        filePath: string
    ): Promise<
        | { ok: true; sites: CaptureSite[]; mtimeMs: number }
        | { ok: false; error: string; mtimeMs: number }
    > {
        let mtimeMs: number;
        try {
            mtimeMs = fs.statSync(filePath).mtimeMs;
        } catch (err) {
            return { ok: false, error: `stat failed: ${err}`, mtimeMs: 0 };
        }

        const scriptPath = this.getScriptPath();
        if (!scriptPath) {
            return { ok: false, error: 'detect_capture_sites.py not found', mtimeMs };
        }

        const interpreter = getPythonInterpreter();
        const stdout = await this.spawnWithTimeout(interpreter, [scriptPath, filePath]);
        if (stdout === undefined) {
            return { ok: false, error: 'AST subprocess timed out or failed', mtimeMs };
        }

        let payload: AstScriptPayload;
        try {
            payload = JSON.parse(stdout) as AstScriptPayload;
        } catch {
            return { ok: false, error: 'invalid JSON from AST script', mtimeMs };
        }

        if (payload.error) {
            return {
                ok: false,
                error: `${payload.error}: ${payload.message ?? 'unknown'}`,
                mtimeMs
            };
        }

        const sites: CaptureSite[] = [];
        for (const raw of payload.sites ?? []) {
            if (typeof raw.line !== 'number' || typeof raw.kind !== 'string') {
                continue;
            }
            if (!isSiteKind(raw.kind)) {
                continue;
            }
            sites.push({ line: raw.line, kind: raw.kind as SiteKind });
        }

        return { ok: true, sites, mtimeMs };
    }

    private spawnWithTimeout(command: string, args: string[]): Promise<string | undefined> {
        return new Promise((resolve) => {
            const proc = spawn(command, args, { windowsHide: true });
            let stdout = '';
            let stderr = '';
            let settled = false;

            const timer = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    proc.kill();
                    resolve(undefined);
                }
            }, AST_TIMEOUT_MS);

            proc.stdout.on('data', (chunk: Buffer) => {
                stdout += chunk.toString();
            });
            proc.stderr.on('data', (chunk: Buffer) => {
                stderr += chunk.toString();
            });

            proc.on('error', (err) => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    pbLog(`AST subprocess error: ${err.message}`);
                    resolve(undefined);
                }
            });

            proc.on('close', (code) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);

                if (code !== 0) {
                    if (stderr.trim()) {
                        pbLog(`AST script stderr: ${stderr.trim()}`);
                    }
                    resolve(stdout.trim() || undefined);
                    return;
                }

                resolve(stdout.trim());
            });
        });
    }
}

/** Shared provider instance (initialized from extension activate). */
export const astCaptureSiteProvider = new AstCaptureSiteProvider();
