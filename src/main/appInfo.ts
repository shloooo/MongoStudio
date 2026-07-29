import {execSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BAKED_GIT_INFO_PATH = path.join(__dirname, '..', 'src', 'main', 'gitInfo.generated.json');

interface GitInfo {
    commit: string | null;
    branch: string | null;
}

interface AppInfoInput {
    appVersion: string;
    projectRoot: string;
    isDev: boolean;
}

function safeGitCommand(args: string, cwd: string): string | null {
    try {
        return execSync(`git ${args}`, {cwd, stdio: ['ignore', 'pipe', 'ignore']})
            .toString('utf-8')
            .trim();
    } catch {
        return null;
    }
}

function readBakedGitInfo(): GitInfo | null {
    try {
        return JSON.parse(fs.readFileSync(BAKED_GIT_INFO_PATH, 'utf-8'));
    } catch {
        return null;
    }
}

function getLiveGitInfo(projectRoot: string): GitInfo {
    const commit = safeGitCommand('rev-parse --short HEAD', projectRoot);
    const branch = safeGitCommand('rev-parse --abbrev-ref HEAD', projectRoot);

    return {
        commit: commit || null,
        branch: branch || null
    };
}

export function getAppInfo({appVersion, projectRoot, isDev}: AppInfoInput) {
    const gitInfo = isDev ? getLiveGitInfo(projectRoot) : readBakedGitInfo();

    return {
        version: appVersion,
        commit: gitInfo?.commit || null,
        branch: gitInfo?.branch || null,
        isDev: !!isDev
    };
}