import { Command } from 'commander';
import { analyzeAction } from './commands/analyze.js';
import { aiAction } from './commands/ai.js';
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.join(__dirname, '../package.json');
const packageJson = fs.readJsonSync(pkgPath);

const program = new Command();

program
    .name('moduly')
    .description('Project Architecture Analyzer & Developer Workflow Dashboard')
    .version(packageJson.version);

program
    .command('analyze')
    .description('Scan project and generate architecture report')
    .option('--open', 'Launch interactive browser dashboard automatically', false)
    .option('--report', 'Output local JSON report', false)
    .action(analyzeAction);

program
    .command('ai')
    .description('Enable or disable AI-assisted commit detection')
    .argument('<state>', 'on or off')
    .action(aiAction);

program.parse();
