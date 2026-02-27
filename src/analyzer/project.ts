import { glob } from 'glob';
import path from 'node:path';
import fs from 'fs-extra';
import { getGitHotspots } from './git.js';
import { analyzeLOC, CODE_EXTENSIONS } from './loc.js';
import { analyzeFileDependencies, analyzePackageDeps } from './dependencies.js';
import { analyzeSecurity } from './security.js';
import { analyzePerformance } from './performance.js';
import { ProjectReport, ProjectStats, FileInfo, Hotspot, DependencyGraph, SecurityVulnerability, PerformanceMetrics } from '../types.js';

/** Build the glob pattern from CODE_EXTENSIONS */
function buildGlobPattern(extensions: string[]): string {
    const exts = extensions.map(e => e.replace('.', ''));
    return `**/*.{${exts.join(',')}}`;
}

export const scanProject = async (projectPath: string): Promise<ProjectReport> => {
    const pattern = buildGlobPattern(CODE_EXTENSIONS);

    const files = await glob(pattern, {
        cwd: projectPath,
        ignore: ['node_modules/**', 'dist/**', '.git/**', '.moduly/**', '.next/**', 'build/**', 'coverage/**', '**/package-lock.json', '**/yarn.lock', '**/pnpm-lock.yaml']
    });

    const stats: ProjectStats = {
        totalFiles: files.length,
        totalLOC: 0,
        totalCodeLines: 0,
        totalCommentLines: 0,
        totalBlankLines: 0,
        languages: {},
        fileList: []
    };

    for (const file of files) {
        const ext = path.extname(file);
        stats.languages[ext] = (stats.languages[ext] || 0) + 1;

        const fullPath = path.join(projectPath, file);
        try {
            const stat = await fs.stat(fullPath);
            const content = await fs.readFile(fullPath, 'utf-8');

            const loc = analyzeLOC(content, ext);

            stats.totalLOC += loc.totalLines;
            stats.totalCodeLines += loc.codeLines;
            stats.totalCommentLines += loc.commentLines;
            stats.totalBlankLines += loc.blankLines;

            stats.fileList.push({
                path: file.replace(/\\/g, '/'),
                size: stat.size,
                extension: ext,
                linesOfCode: loc.codeLines,
                loc,
            });
        } catch (e) {
            // Skip files that can't be read
        }
    }

    // Sort fileList by lines of code descending for frontend graph visualization
    stats.fileList.sort((a, b) => b.linesOfCode - a.linesOfCode);

    const hotspots = await getGitHotspots(projectPath);

    // AST-based file dependency graph
    const dependencies = await analyzeFileDependencies(projectPath, files);

    // AST-based package dependency analysis
    const packageDependencies = await analyzePackageDeps(projectPath, files);

    // Real security scanning (npm audit + AST code scan)
    const security = await analyzeSecurity(projectPath, files);

    // Real performance analysis
    const performance = await analyzePerformance(projectPath, stats);

    return {
        projectName: path.basename(projectPath),
        timestamp: new Date().toISOString(),
        stats,
        hotspots,
        dependencies,
        packageDependencies,
        security,
        performance,
        score: calculateHealthScore(stats, hotspots, dependencies, packageDependencies?.unused.length || 0, security)
    };
};

function calculateHealthScore(
    stats: ProjectStats,
    hotspots: Hotspot[],
    dependencies: DependencyGraph,
    unusedDepsCount: number,
    security: SecurityVulnerability[]
): number {
    let score = 100;

    // Penalize large projects without structure
    if (stats.totalFiles > 200) score -= 10;
    if (stats.totalLOC > 10000) score -= 10;

    // Penalize hotspots (volatile files)
    const activeHotspots = hotspots.filter(h => h.commits > 10).length;
    score -= Math.min(activeHotspots * 3, 15);

    // Penalize high coupling
    const couplingRatio = dependencies.links.length / (dependencies.nodes.length || 1);
    if (couplingRatio > 3) score -= 15;

    // Penalize unused dependencies
    score -= Math.min(unusedDepsCount * 2, 15);

    // Penalize security vulnerabilities
    const criticalCount = security.filter(v => v.severity === 'critical').length;
    const highCount = security.filter(v => v.severity === 'high').length;
    const mediumCount = security.filter(v => v.severity === 'medium').length;
    const securityPenalty = Math.min((criticalCount * 10) + (highCount * 5) + (mediumCount * 2), 30);
    score -= securityPenalty;

    // Reward good comment ratio (5-20% is healthy)
    if (stats.totalCodeLines > 0) {
        const commentRatio = stats.totalCommentLines / stats.totalCodeLines;
        if (commentRatio < 0.05) score -= 5; // Too few comments
    }

    return Math.floor(Math.max(0, Math.min(100, score)));
}

