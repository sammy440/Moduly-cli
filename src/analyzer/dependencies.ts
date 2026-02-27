import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import path from 'node:path';
import fs from 'fs-extra';
import { DependencyGraph, PackageDependencies } from '../types.js';

// Handle ESM default import for @babel/traverse
const traverse = (typeof _traverse === 'function' ? _traverse : (_traverse as any).default) as typeof _traverse;

/**
 * Extract all import sources from a file using Babel AST parsing.
 * Handles: import declarations, require() calls, dynamic import().
 */
function extractImports(content: string, filePath: string): string[] {
    const imports: string[] = [];
    const ext = path.extname(filePath);

    try {
        const ast = parse(content, {
            sourceType: 'module',
            plugins: [
                'typescript',
                'jsx',
                'decorators-legacy',
                'classProperties',
                'dynamicImport',
                'optionalChaining',
                'nullishCoalescingOperator',
                'exportDefaultFrom',
                'exportNamespaceFrom',
            ],
            errorRecovery: true,
        });

        traverse(ast, {
            // import ... from 'source'
            ImportDeclaration(nodePath) {
                imports.push(nodePath.node.source.value);
            },
            // export ... from 'source'
            ExportNamedDeclaration(nodePath) {
                if (nodePath.node.source) {
                    imports.push(nodePath.node.source.value);
                }
            },
            ExportAllDeclaration(nodePath) {
                imports.push(nodePath.node.source.value);
            },
            // require('source') or import('source')
            CallExpression(nodePath) {
                const callee = nodePath.node.callee;

                // require('...')
                if (callee.type === 'Identifier' && callee.name === 'require') {
                    const arg = nodePath.node.arguments[0];
                    if (arg && arg.type === 'StringLiteral') {
                        imports.push(arg.value);
                    }
                }

                // import('...')
                if (callee.type === 'Import') {
                    const arg = nodePath.node.arguments[0];
                    if (arg && arg.type === 'StringLiteral') {
                        imports.push(arg.value);
                    }
                }
            },
        });
    } catch (e) {
        // If AST parsing fails, skip this file silently
    }

    return imports;
}

/**
 * Determine if an import source is a relative/local file import.
 */
function isRelativeImport(source: string): boolean {
    return source.startsWith('.') || source.startsWith('/');
}

/**
 * Get the bare package name from an import source.
 * e.g. '@babel/parser' -> '@babel/parser', 'lodash/merge' -> 'lodash'
 */
function getPackageName(source: string): string {
    if (source.startsWith('@')) {
        // Scoped package: @scope/name
        const parts = source.split('/');
        return parts.slice(0, 2).join('/');
    }
    return source.split('/')[0];
}

/**
 * Analyze file-level dependencies (file-to-file imports) using AST parsing.
 */
export async function analyzeFileDependencies(
    projectPath: string,
    files: string[]
): Promise<DependencyGraph> {
    const nodes = files.map(f => ({ id: f.replace(/\\/g, '/') }));
    const links: { source: string; target: string }[] = [];
    const normalizedFiles = files.map(f => f.replace(/\\/g, '/'));

    for (const file of files) {
        try {
            const fullPath = path.join(projectPath, file);
            const content = await fs.readFile(fullPath, 'utf-8');
            const imports = extractImports(content, file);

            for (const importSource of imports) {
                if (!isRelativeImport(importSource)) continue;

                const dirname = path.dirname(file);
                let resolved = path.join(dirname, importSource).replace(/\\/g, '/');

                // Try resolving with common extensions
                const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
                for (const ext of extensions) {
                    const candidate = (resolved + ext).replace(/\\/g, '/');
                    // Also try replacing .js with .ts (common in TypeScript projects)
                    const candidateAlt = candidate.replace(/\.js$/, '.ts').replace(/\\/g, '/');

                    const match = normalizedFiles.find(f => f === candidate || f === candidateAlt);
                    if (match) {
                        links.push({
                            source: file.replace(/\\/g, '/'),
                            target: match,
                        });
                        break;
                    }
                }
            }
        } catch (e) {
            // Skip files that can't be read
        }
    }

    return {
        nodes: nodes.slice(0, 1000),
        links: links.slice(0, 2000),
    };
}

/**
 * Analyze package.json dependencies and detect used/unused packages
 * using AST-based import detection across the entire codebase.
 */
export async function analyzePackageDeps(
    projectPath: string,
    files: string[]
): Promise<PackageDependencies> {
    const defaultResult: PackageDependencies = {
        dependencies: {},
        devDependencies: {},
        used: [],
        unused: [],
        outdated: [],
        suggestions: [],
    };

    try {
        const pkgJsonPath = path.join(projectPath, 'package.json');
        if (!await fs.pathExists(pkgJsonPath)) return defaultResult;

        const pkg = await fs.readJson(pkgJsonPath);
        const dependencies = pkg.dependencies || {};
        const devDependencies = pkg.devDependencies || {};
        const allDeps = { ...dependencies, ...devDependencies };
        const allDepNames = Object.keys(allDeps);

        // Collect all external imports from the entire codebase using AST
        const usedPackages = new Set<string>();

        for (const file of files) {
            try {
                const fullPath = path.join(projectPath, file);
                const content = await fs.readFile(fullPath, 'utf-8');
                const imports = extractImports(content, file);

                for (const source of imports) {
                    if (isRelativeImport(source)) continue;

                    const pkgName = getPackageName(source);
                    if (allDepNames.includes(pkgName)) {
                        usedPackages.add(pkgName);
                    }
                }
            } catch (e) {
                // Skip unreadable files
            }
        }

        const used = allDepNames.filter(dep => usedPackages.has(dep));

        // Build-time / type-only packages that are never directly imported at runtime
        const BUILD_TIME_PACKAGES = new Set([
            'typescript', '@types/', 'eslint', 'prettier',
            'ts-node', 'tsx', 'jest', 'mocha', 'vitest',
            'webpack', 'vite', 'rollup', 'esbuild', 'turbo',
        ]);

        const isBuildTimeDep = (dep: string) =>
            BUILD_TIME_PACKAGES.has(dep) || dep.startsWith('@types/');

        const unused = allDepNames.filter(dep =>
            !usedPackages.has(dep) && !isBuildTimeDep(dep)
        );

        // Detect outdated packages by checking version patterns
        const outdated = allDepNames
            .filter(dep => {
                const version = allDeps[dep];
                // Flag packages with very old-looking constraints or no caret/tilde
                return version && !version.startsWith('^') && !version.startsWith('~') && !version.startsWith('*');
            })
            .map(dep => ({
                name: dep,
                current: allDeps[dep],
                latest: 'check npm registry',
            }));

        // Generate suggestions based on what's missing
        const suggestions: string[] = [];
        const hasTypeScript = allDepNames.includes('typescript');
        const hasEslint = allDepNames.includes('eslint');
        const hasPrettier = allDepNames.includes('prettier');

        if (!hasTypeScript) suggestions.push('typescript - Add type safety to your project');
        if (!hasEslint) suggestions.push('eslint - Add code quality linting');
        if (!hasPrettier) suggestions.push('prettier - Add consistent code formatting');

        return {
            dependencies,
            devDependencies,
            used,
            unused,
            outdated,
            suggestions,
        };
    } catch {
        return defaultResult;
    }
}
