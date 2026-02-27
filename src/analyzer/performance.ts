import path from 'node:path';
import fs from 'fs-extra';
import { PerformanceMetrics, ProjectStats } from '../types.js';

// ─── Known heavy/bloated packages ──────────────────────────────────────────────

const HEAVY_PACKAGES: Record<string, string> = {
    'moment': 'moment is 300KB+ with locale data. Use dayjs (~2KB) or date-fns as lighter alternatives.',
    'lodash': 'lodash is ~70KB. Use lodash-es for tree-shaking or import individual functions (lodash/get).',
    'jquery': 'jQuery is ~90KB. Modern browsers have native APIs (fetch, querySelector) that replace most jQuery use cases.',
    'axios': 'axios is ~13KB. For simple use cases, the native fetch() API may be sufficient.',
    'underscore': 'underscore is ~6KB. Most utility methods are now natively available in modern JavaScript.',
    'bluebird': 'bluebird is ~18KB. Native Promises are now well-supported in all modern environments.',
    'request': 'request is deprecated and ~500KB. Use node-fetch, got, or native fetch().',
    'async': 'async is ~30KB. Native async/await and Promise.all() cover most use cases.',
    'rxjs': 'rxjs is ~40KB minified. If only using a few operators, consider lighter alternatives.',
    'core-js': 'core-js can add 100KB+. Only polyfill what you actually need, or use browserslist targeting.',
    '@fortawesome/fontawesome-free': 'Font Awesome is 1.5MB+ with all icons. Use icon subsets or lucide-react (~4KB per icon).',
    'animate.css': 'animate.css is ~80KB. Consider using native CSS animations or a smaller library.',
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

/**
 * Estimate the bundle size from node_modules.
 * Sums up the size of all direct dependency directories.
 */
async function estimateBundleSize(projectPath: string): Promise<number> {
    let totalSize = 0;

    try {
        const pkgJsonPath = path.join(projectPath, 'package.json');
        if (!await fs.pathExists(pkgJsonPath)) return 0;

        const pkg = await fs.readJson(pkgJsonPath);
        const deps = Object.keys(pkg.dependencies || {});
        const nodeModules = path.join(projectPath, 'node_modules');

        if (!await fs.pathExists(nodeModules)) return 0;

        for (const dep of deps) {
            const depPath = path.join(nodeModules, dep);
            try {
                if (await fs.pathExists(depPath)) {
                    totalSize += await getDirSize(depPath);
                }
            } catch {
                // Skip inaccessible packages
            }
        }
    } catch {
        // Return 0 if anything fails
    }

    return totalSize;
}

async function getDirSize(dirPath: string): Promise<number> {
    let size = 0;
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const entryPath = path.join(dirPath, entry.name);
            if (entry.isFile()) {
                const stat = await fs.stat(entryPath);
                size += stat.size;
            } else if (entry.isDirectory() && entry.name !== 'node_modules') {
                size += await getDirSize(entryPath);
            }
        }
    } catch {
        // Permission errors etc
    }
    return size;
}

/**
 * Estimate initial load time based on bundle size.
 * Rough estimate: ~1MB/s on 3G, ~5MB/s on 4G, ~20MB/s on broadband.
 * We use a moderate 4G assumption.
 */
function estimateLoadTime(bundleSizeBytes: number): string {
    const speedBytesPerSec = 5 * 1024 * 1024; // 5MB/s
    const parseOverhead = 0.3; // 300ms base for parsing/rendering
    const seconds = (bundleSizeBytes / speedBytesPerSec) + parseOverhead;
    return `${seconds.toFixed(1)}s`;
}

// ─── Main export ───────────────────────────────────────────────────────────────

export async function analyzePerformance(
    projectPath: string,
    stats: ProjectStats
): Promise<PerformanceMetrics> {
    // 1. Calculate total source size
    const totalSourceBytes = stats.fileList.reduce((sum, f) => sum + f.size, 0);

    // 2. Estimate bundle size from node_modules
    const bundleSizeBytes = await estimateBundleSize(projectPath);

    // 3. Count production dependencies
    let dependencyCount = 0;
    try {
        const pkgJsonPath = path.join(projectPath, 'package.json');
        if (await fs.pathExists(pkgJsonPath)) {
            const pkg = await fs.readJson(pkgJsonPath);
            dependencyCount = Object.keys(pkg.dependencies || {}).length;
        }
    } catch { /* skip */ }

    // 4. Detect large source files (> 500 lines or > 20KB)
    const largeFiles = stats.fileList
        .filter(f => f.loc.totalLines > 500 || f.size > 20480)
        .map(f => ({
            path: f.path,
            size: formatSize(f.size),
            lines: f.loc.totalLines,
        }));

    // 5. Detect heavy dependencies
    const heavyDependencies: Array<{ name: string; reason: string }> = [];
    try {
        const pkgJsonPath = path.join(projectPath, 'package.json');
        if (await fs.pathExists(pkgJsonPath)) {
            const pkg = await fs.readJson(pkgJsonPath);
            const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
            for (const dep of Object.keys(allDeps)) {
                if (HEAVY_PACKAGES[dep]) {
                    heavyDependencies.push({
                        name: dep,
                        reason: HEAVY_PACKAGES[dep],
                    });
                }
            }
        }
    } catch { /* skip */ }

    return {
        bundleSize: bundleSizeBytes > 0 ? formatSize(bundleSizeBytes) : formatSize(totalSourceBytes),
        sourceSize: formatSize(totalSourceBytes),
        loadTime: estimateLoadTime(bundleSizeBytes > 0 ? bundleSizeBytes : totalSourceBytes),
        dependencyCount,
        largeFiles,
        heavyDependencies,
    };
}
