import ora from 'ora';
import chalk from 'chalk';
import { scanProject } from '../analyzer/project.js';
import { generateDashboard } from '../dashboard/generator.js';
import open from 'open';
import fs from 'fs-extra';
import path from 'node:path';

interface AnalyzeOptions {
    open: boolean;
    report: boolean;
}

export const analyzeAction = async (options: AnalyzeOptions) => {
    const spinner = ora('Analyzing project architecture...').start();

    try {
        const projectPath = process.cwd();

        spinner.text = 'Scanning files and dependencies...';
        const report = await scanProject(projectPath);

        spinner.text = 'Generating interactive dashboard...';
        const dashboardHtml = generateDashboard(report);

        const outputDir = path.join(projectPath, '.moduly');
        await fs.ensureDir(outputDir);

        // Auto-add to .gitignore if it exists
        const gitignorePath = path.join(projectPath, '.gitignore');
        if (await fs.pathExists(gitignorePath)) {
            const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
            if (!gitignoreContent.includes('.moduly')) {
                await fs.appendFile(gitignorePath, '\n# Moduly\n.moduly\n');
            }
        }

        const htmlPath = path.join(outputDir, 'index.html');
        await fs.writeFile(htmlPath, dashboardHtml);

        if (options.report) {
            const reportPath = path.join(outputDir, 'report.json');
            await fs.writeJson(reportPath, report, { spaces: 2 });
            spinner.info(`Report saved to ${chalk.cyan(reportPath)}`);

            // Try pushing to live dashboard instantly
            try {
                await fetch('https://moduly-zeta.vercel.app/api/report', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(report)
                });
                spinner.info('Dashboard synced dynamically.');

                // Automatically open the deployed dashboard
                if (options.report) {
                    console.log(chalk.blue(`Opening dynamic dashboard: https://moduly-zeta.vercel.app/dashboard`));
                    await open('https://moduly-zeta.vercel.app/dashboard');
                }
            } catch (err) {
                // If the dashboard isn't running on port 3000, ignore silently.
            }
        }

        spinner.succeed(chalk.green('Analysis complete!'));

        if (options.open) {
            console.log(chalk.blue(`Opening dashboard: ${htmlPath}`));
            await open(htmlPath);
        }
    } catch (error) {
        spinner.fail(chalk.red('Analysis failed.'));
        console.error(error);
    }
};
