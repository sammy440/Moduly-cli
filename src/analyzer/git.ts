import { simpleGit } from 'simple-git';
import { Hotspot } from '../types.js';

export const getGitHotspots = async (projectPath: string): Promise<Hotspot[]> => {
    const git = simpleGit(projectPath);

    try {
        const isRepo = await git.checkIsRepo();
        if (!isRepo) return [];

        // Get log with file information
        const log = await git.log(['--name-only']);
        const fileCounts: Record<string, number> = {};

        log.all.forEach(commit => {
            // simple-git's log doesn't always provide files in the 'all' array directly with --name-only
            // We might need a different approach or parse the body if available
            // Actually, simple-git provides a better way to get file frequencies if we use raw commands or specific log formats
        });

        // Better approach: use raw git command to get most changed files
        const raw = await git.raw(['log', '--pretty=format:', '--name-only']);
        const files = raw.split('\n').filter(f => f.trim().length > 0);

        files.forEach(file => {
            fileCounts[file] = (fileCounts[file] || 0) + 1;
        });

        return Object.entries(fileCounts)
            .map(([file, commits]) => ({ file, commits }))
            .sort((a, b) => b.commits - a.commits)
            .slice(0, 10);
    } catch (error) {
        console.error('Error fetching git hotspots:', error);
        return [];
    }
};
