import { LOCStats } from '../types.js';

/**
 * Language-specific comment patterns for accurate LOC counting.
 */
const COMMENT_PATTERNS: Record<string, { single: string; blockStart: string; blockEnd: string }> = {
    '.js': { single: '//', blockStart: '/*', blockEnd: '*/' },
    '.jsx': { single: '//', blockStart: '/*', blockEnd: '*/' },
    '.ts': { single: '//', blockStart: '/*', blockEnd: '*/' },
    '.tsx': { single: '//', blockStart: '/*', blockEnd: '*/' },
    '.css': { single: '', blockStart: '/*', blockEnd: '*/' },
    '.scss': { single: '//', blockStart: '/*', blockEnd: '*/' },
    '.html': { single: '', blockStart: '<!--', blockEnd: '-->' },
    '.json': { single: '', blockStart: '', blockEnd: '' },
    '.md': { single: '', blockStart: '', blockEnd: '' },
    '.py': { single: '#', blockStart: '"""', blockEnd: '"""' },
    '.yaml': { single: '#', blockStart: '', blockEnd: '' },
    '.yml': { single: '#', blockStart: '', blockEnd: '' },
};

/** Supported code file extensions for scanning */
export const CODE_EXTENSIONS = [
    '.js', '.jsx', '.ts', '.tsx',
    '.css', '.scss',
    '.html',
    '.json',
    '.py',
    '.yaml', '.yml',
    '.md',
];

/**
 * Analyze a file's contents and return detailed LOC stats.
 * Counts total lines, blank lines, comment lines, and actual code lines.
 */
export function analyzeLOC(content: string, extension: string): LOCStats {
    const lines = content.split('\n');
    const totalLines = lines.length;
    let blankLines = 0;
    let commentLines = 0;
    let codeLines = 0;

    const pattern = COMMENT_PATTERNS[extension] || { single: '//', blockStart: '/*', blockEnd: '*/' };
    let inBlockComment = false;

    for (const rawLine of lines) {
        const line = rawLine.trim();

        // Blank line
        if (line === '') {
            blankLines++;
            continue;
        }

        // Currently inside a block comment
        if (inBlockComment) {
            commentLines++;
            if (pattern.blockEnd && line.includes(pattern.blockEnd)) {
                inBlockComment = false;
            }
            continue;
        }

        // Block comment start
        if (pattern.blockStart && line.startsWith(pattern.blockStart)) {
            commentLines++;
            if (!pattern.blockEnd || !line.includes(pattern.blockEnd, pattern.blockStart.length)) {
                inBlockComment = true;
            }
            continue;
        }

        // Single-line comment
        if (pattern.single && line.startsWith(pattern.single)) {
            commentLines++;
            continue;
        }

        // Everything else is code
        codeLines++;
    }

    return { totalLines, codeLines, commentLines, blankLines };
}
