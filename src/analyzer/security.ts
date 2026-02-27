import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import path from 'node:path';
import fs from 'fs-extra';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { SecurityVulnerability } from '../types.js';

const execAsync = promisify(exec);
const traverse = (typeof _traverse === 'function' ? _traverse : (_traverse as any).default) as typeof _traverse;

// ─── Dangerous code patterns to scan for ───────────────────────────────────────

interface CodePattern {
    name: string;
    category: string;
    severity: SecurityVulnerability['severity'];
    description: string;
    check: (nodePath: any) => boolean;
}

const DANGEROUS_PATTERNS: CodePattern[] = [
    {
        name: 'eval() Usage',
        category: 'Code Injection',
        severity: 'critical',
        description: 'eval() executes arbitrary code and is a major injection risk. Use safer alternatives like JSON.parse() or Function constructors.',
        check: (nodePath) =>
            nodePath.node.callee?.type === 'Identifier' && nodePath.node.callee.name === 'eval',
    },
    {
        name: 'Function() Constructor',
        category: 'Code Injection',
        severity: 'high',
        description: 'new Function() dynamically creates functions from strings, similar to eval(). Avoid using user input.',
        check: (nodePath) =>
            nodePath.node.callee?.type === 'Identifier' && nodePath.node.callee.name === 'Function',
    },
    {
        name: 'child_process exec()',
        category: 'Command Injection',
        severity: 'high',
        description: 'exec() runs shell commands and is vulnerable to command injection. Prefer execFile() with explicit arguments.',
        check: (nodePath) => {
            const callee = nodePath.node.callee;
            if (callee?.type === 'Identifier' && (callee.name === 'exec' || callee.name === 'execSync')) return true;
            if (callee?.type === 'MemberExpression' && callee.property?.type === 'Identifier' &&
                (callee.property.name === 'exec' || callee.property.name === 'execSync')) return true;
            return false;
        },
    },
    {
        name: 'innerHTML Assignment',
        category: 'Cross-Site Scripting (XSS)',
        severity: 'medium',
        description: 'innerHTML injects raw HTML and can lead to XSS. Use textContent or a sanitization library instead.',
        check: (nodePath) => {
            if (nodePath.type !== 'AssignmentExpression') return false;
            const left = nodePath.node.left;
            return left?.type === 'MemberExpression' &&
                left.property?.type === 'Identifier' &&
                left.property.name === 'innerHTML';
        },
    },
    {
        name: 'dangerouslySetInnerHTML',
        category: 'Cross-Site Scripting (XSS)',
        severity: 'medium',
        description: 'dangerouslySetInnerHTML renders raw HTML in React components. Ensure content is properly sanitized.',
        check: (nodePath) => {
            if (nodePath.type !== 'JSXAttribute') return false;
            return nodePath.node.name?.name === 'dangerouslySetInnerHTML';
        },
    },
    {
        name: 'document.write()',
        category: 'Cross-Site Scripting (XSS)',
        severity: 'medium',
        description: 'document.write() is a legacy DOM method that can overwrite the entire page and is XSS-prone.',
        check: (nodePath) => {
            const callee = nodePath.node.callee;
            return callee?.type === 'MemberExpression' &&
                callee.object?.type === 'Identifier' && callee.object.name === 'document' &&
                callee.property?.type === 'Identifier' && callee.property.name === 'write';
        },
    },
];

// ─── Sensitive data patterns (checked via line scanning, not AST) ───────────

const SECRET_PATTERNS = [
    { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/i, name: 'Hardcoded API Key', severity: 'high' as const },
    { pattern: /(?:secret|password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/i, name: 'Hardcoded Secret/Password', severity: 'critical' as const },
    { pattern: /(?:aws_access_key_id|aws_secret_access_key)\s*[:=]\s*['"][A-Za-z0-9/+=]{16,}['"]/i, name: 'AWS Credentials', severity: 'critical' as const },
    { pattern: /(?:private[_-]?key)\s*[:=]\s*['"][^'"]{20,}['"]/i, name: 'Private Key Exposure', severity: 'critical' as const },
    { pattern: /(?:token)\s*[:=]\s*['"][A-Za-z0-9_\-.]{20,}['"]/i, name: 'Hardcoded Token', severity: 'high' as const },
];

// ─── npm audit runner ──────────────────────────────────────────────────────────

async function runNpmAudit(projectPath: string): Promise<SecurityVulnerability[]> {
    const vulns: SecurityVulnerability[] = [];

    try {
        const pkgJsonPath = path.join(projectPath, 'package.json');
        const lockPath = path.join(projectPath, 'package-lock.json');

        if (!await fs.pathExists(pkgJsonPath) || !await fs.pathExists(lockPath)) {
            return vulns;
        }

        const { stdout } = await execAsync('npm audit --json 2>&1', {
            cwd: projectPath,
            timeout: 30000,
        });

        const auditResult = JSON.parse(stdout);

        // npm audit v7+ format
        if (auditResult.vulnerabilities) {
            for (const [name, vuln] of Object.entries<any>(auditResult.vulnerabilities)) {
                const severity = vuln.severity as SecurityVulnerability['severity'];
                const via = Array.isArray(vuln.via)
                    ? vuln.via.filter((v: any) => typeof v === 'object').map((v: any) => v.title || v.name).join(', ')
                    : String(vuln.via);

                vulns.push({
                    name: `${name} (${vuln.range || ''})`,
                    severity: ['low', 'medium', 'high', 'critical'].includes(severity) ? severity : 'low',
                    description: via || `Vulnerable version: ${vuln.range}`,
                    source: 'npm-audit',
                    category: 'Dependency Vulnerability',
                });
            }
        }
        // npm audit v6 format
        else if (auditResult.advisories) {
            for (const advisory of Object.values<any>(auditResult.advisories)) {
                vulns.push({
                    name: `${advisory.module_name} – ${advisory.title}`,
                    severity: advisory.severity as SecurityVulnerability['severity'],
                    description: advisory.overview || advisory.title,
                    source: 'npm-audit',
                    category: 'Dependency Vulnerability',
                });
            }
        }
    } catch (e: any) {
        // npm audit exits with non-zero when vulnerabilities ARE found, so parse stdout
        try {
            const stdout = e.stdout || '';
            if (stdout) {
                const auditResult = JSON.parse(stdout);
                if (auditResult.vulnerabilities) {
                    for (const [name, vuln] of Object.entries<any>(auditResult.vulnerabilities)) {
                        const severity = vuln.severity as SecurityVulnerability['severity'];
                        const via = Array.isArray(vuln.via)
                            ? vuln.via.filter((v: any) => typeof v === 'object').map((v: any) => v.title || v.name).join(', ')
                            : String(vuln.via);

                        vulns.push({
                            name: `${name} (${vuln.range || ''})`,
                            severity: ['low', 'medium', 'high', 'critical'].includes(severity) ? severity : 'low',
                            description: via || `Vulnerable version: ${vuln.range}`,
                            source: 'npm-audit',
                            category: 'Dependency Vulnerability',
                        });
                    }
                }
            }
        } catch {
            // Could not parse audit output, skip
        }
    }

    return vulns;
}

// ─── AST-based code scanning ───────────────────────────────────────────────────

async function scanFileForVulnerabilities(
    filePath: string,
    content: string,
    relativePath: string
): Promise<SecurityVulnerability[]> {
    const vulns: SecurityVulnerability[] = [];
    const ext = path.extname(filePath);

    // Only AST-parse JS/TS files
    if (!['.js', '.jsx', '.ts', '.tsx'].includes(ext)) return vulns;

    // 1. AST-based pattern detection
    try {
        const ast = parse(content, {
            sourceType: 'module',
            plugins: ['typescript', 'jsx', 'decorators-legacy', 'classProperties', 'dynamicImport', 'optionalChaining', 'nullishCoalescingOperator'],
            errorRecovery: true,
        });

        traverse(ast, {
            CallExpression(nodePath) {
                for (const pattern of DANGEROUS_PATTERNS.filter(p =>
                    p.name !== 'innerHTML Assignment' && p.name !== 'dangerouslySetInnerHTML'
                )) {
                    if (pattern.check(nodePath)) {
                        vulns.push({
                            name: pattern.name,
                            severity: pattern.severity,
                            description: pattern.description,
                            source: 'code-scan',
                            file: relativePath,
                            line: nodePath.node.loc?.start.line,
                            category: pattern.category,
                        });
                    }
                }
            },
            AssignmentExpression(nodePath) {
                const innerHTMLPattern = DANGEROUS_PATTERNS.find(p => p.name === 'innerHTML Assignment');
                if (innerHTMLPattern && innerHTMLPattern.check(nodePath)) {
                    vulns.push({
                        name: innerHTMLPattern.name,
                        severity: innerHTMLPattern.severity,
                        description: innerHTMLPattern.description,
                        source: 'code-scan',
                        file: relativePath,
                        line: nodePath.node.loc?.start.line,
                        category: innerHTMLPattern.category,
                    });
                }
            },
            JSXAttribute(nodePath) {
                const dangerousPattern = DANGEROUS_PATTERNS.find(p => p.name === 'dangerouslySetInnerHTML');
                if (dangerousPattern && dangerousPattern.check(nodePath)) {
                    vulns.push({
                        name: dangerousPattern.name,
                        severity: dangerousPattern.severity,
                        description: dangerousPattern.description,
                        source: 'code-scan',
                        file: relativePath,
                        line: nodePath.node.loc?.start.line,
                        category: dangerousPattern.category,
                    });
                }
            },
        });
    } catch {
        // Skip files that can't be parsed
    }

    // 2. Line-based secret detection
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comments
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

        for (const secret of SECRET_PATTERNS) {
            if (secret.pattern.test(line)) {
                vulns.push({
                    name: secret.name,
                    severity: secret.severity,
                    description: `Potential ${secret.name.toLowerCase()} detected. Never commit secrets to source code. Use environment variables instead.`,
                    source: 'code-scan',
                    file: relativePath,
                    line: i + 1,
                    category: 'Sensitive Data Exposure',
                });
                break; // One finding per line is enough
            }
        }
    }

    return vulns;
}

// ─── Main export ───────────────────────────────────────────────────────────────

export async function analyzeSecurity(
    projectPath: string,
    files: string[]
): Promise<SecurityVulnerability[]> {
    const allVulns: SecurityVulnerability[] = [];

    // 1. Run npm audit for dependency vulnerabilities
    const auditVulns = await runNpmAudit(projectPath);
    allVulns.push(...auditVulns);

    // 2. Scan source code files for dangerous patterns
    for (const file of files) {
        const ext = path.extname(file);
        if (!['.js', '.jsx', '.ts', '.tsx'].includes(ext)) continue;

        try {
            const fullPath = path.join(projectPath, file);
            const content = await fs.readFile(fullPath, 'utf-8');
            const relativePath = file.replace(/\\/g, '/');
            const fileVulns = await scanFileForVulnerabilities(fullPath, content, relativePath);
            allVulns.push(...fileVulns);
        } catch {
            // Skip unreadable files
        }
    }

    // Sort: critical first, then high, medium, low
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    allVulns.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return allVulns;
}
