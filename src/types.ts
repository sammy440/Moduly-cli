export interface LOCStats {
    totalLines: number;
    codeLines: number;
    commentLines: number;
    blankLines: number;
}

export interface ProjectStats {
    totalFiles: number;
    totalLOC: number;
    totalCodeLines: number;
    totalCommentLines: number;
    totalBlankLines: number;
    languages: Record<string, number>;
    fileList: FileInfo[];
}

export interface FileInfo {
    path: string;
    size: number;
    extension: string;
    linesOfCode: number;
    loc: LOCStats;
}

export interface Hotspot {
    file: string;
    commits: number;
}

export interface DependencyGraph {
    nodes: Array<{ id: string }>;
    links: Array<{ source: string; target: string }>;
}

export interface PackageDependencies {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    used: string[];
    unused: string[];
    outdated: Array<{ name: string; current: string; latest: string }>;
    suggestions: string[];
}

export interface SecurityVulnerability {
    name: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    source: 'npm-audit' | 'code-scan';
    file?: string;
    line?: number;
    category?: string;
}

export interface PerformanceMetrics {
    bundleSize: string;
    sourceSize: string;
    loadTime: string;
    dependencyCount: number;
    largeFiles: Array<{ path: string; size: string; lines: number }>;
    heavyDependencies: Array<{ name: string; reason: string }>;
}

export interface ProjectReport {
    projectName: string;
    timestamp: string;
    stats: ProjectStats;
    hotspots: Hotspot[];
    dependencies: DependencyGraph;
    packageDependencies?: PackageDependencies;
    security?: SecurityVulnerability[];
    performance?: PerformanceMetrics;
    score: number;
}
