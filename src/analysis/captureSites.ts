/** AST / regex capture-site kinds (Phase 3.5). */
export type SiteKind = 'return' | 'assign' | 'if' | 'elif' | 'raise' | 'loop';

export interface CaptureSite {
    line: number;
    kind: SiteKind;
    score?: number;
}

export const SITE_KIND_PRIORITY: Record<SiteKind, number> = {
    return: 5,
    raise: 4,
    if: 3,
    elif: 3,
    assign: 2,
    loop: 1
};

const POLICY_VERSION = 'ast-v1';

export function getCaptureSitePolicyVersion(): string {
    return POLICY_VERSION;
}

export function isSiteKind(value: string): value is SiteKind {
    return value in SITE_KIND_PRIORITY;
}

/** One site per line; highest-priority kind wins. */
export function dedupeSitesByLine(sites: CaptureSite[]): CaptureSite[] {
    const byLine = new Map<number, CaptureSite>();

    for (const site of sites) {
        const existing = byLine.get(site.line);
        if (!existing || SITE_KIND_PRIORITY[site.kind] > SITE_KIND_PRIORITY[existing.kind]) {
            byLine.set(site.line, site);
        }
    }

    return Array.from(byLine.values()).sort((a, b) => a.line - b.line);
}

/**
 * When loop headers exceed max, keep the first N loop sites by line order.
 * Other kinds are unchanged.
 */
export function applyLoopBudget(sites: CaptureSite[], maxLoops: number): CaptureSite[] {
    if (maxLoops < 0) {
        return sites;
    }

    const loops = sites.filter((s) => s.kind === 'loop').sort((a, b) => a.line - b.line);
    if (loops.length <= maxLoops) {
        return sites;
    }

    const allowedLoopLines = new Set(loops.slice(0, maxLoops).map((s) => s.line));
    return sites.filter((s) => s.kind !== 'loop' || allowedLoopLines.has(s.line));
}

export function finalizeCaptureSites(sites: CaptureSite[], maxLoopsPerFile: number): CaptureSite[] {
    return dedupeSitesByLine(applyLoopBudget(sites, maxLoopsPerFile));
}

export function sitesToLines(sites: CaptureSite[]): number[] {
    return sites.map((s) => s.line);
}

export function formatKindBreakdown(sites: CaptureSite[]): string {
    const counts = new Map<SiteKind, number>();
    for (const site of sites) {
        counts.set(site.kind, (counts.get(site.kind) ?? 0) + 1);
    }
    return Array.from(counts.entries())
        .map(([kind, n]) => `${kind}=${n}`)
        .join(', ');
}
