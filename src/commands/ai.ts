import chalk from 'chalk';
import Conf from 'conf';

const config = new Conf({ projectName: 'moduly' });

export const aiAction = (state: string) => {
    if (state === 'on') {
        config.set('aiEnabled', true);
        console.log(chalk.green('✔ AI-assisted commit detection enabled.'));
    } else if (state === 'off') {
        config.set('aiEnabled', false);
        console.log(chalk.yellow('ℹ AI-assisted commit detection disabled.'));
    } else {
        console.error(chalk.red('Error: Invalid state. Use "on" or "off".'));
    }
};
