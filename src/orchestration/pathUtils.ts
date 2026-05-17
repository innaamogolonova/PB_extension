import * as fs from 'fs';
import * as path from 'path';

export function normalizeSourcePath(sourcePath: string): string {
    return path.normalize(sourcePath);
}

/** Resolve symlinks so debugger paths match workspace paths. */
export function resolveRealPath(fsPath: string): string {
    try {
        return fs.realpathSync.native(fsPath);
    } catch {
        return normalizeSourcePath(fsPath);
    }
}

/** 1-based line number, canonical file path. */
export function captureSiteKey(sourcePath: string, line: number): string {
    return `${resolveRealPath(sourcePath)}#${line}`;
}

export function captureSiteKeysForPath(sourcePath: string, line: number): string[] {
    const normalized = normalizeSourcePath(sourcePath);
    const real = resolveRealPath(sourcePath);
    const keys = new Set<string>([
        `${normalized}#${line}`,
        `${real}#${line}`
    ]);
    return Array.from(keys);
}

export function isExcludedTracePath(fsPath: string): boolean {
    const normalized = normalizeSourcePath(fsPath);
    const markers = [
        `${path.sep}site-packages${path.sep}`,
        `${path.sep}.venv${path.sep}`,
        `${path.sep}venv${path.sep}`,
        `${path.sep}node_modules${path.sep}`,
        `${path.sep}__pycache__${path.sep}`
    ];
    return markers.some((marker) => normalized.includes(marker));
}
