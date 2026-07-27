const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const BAKED_GIT_INFO_PATH = path.join(__dirname, 'gitInfo.generated.json');

function safeGitCommand(args, cwd) {
    try {
        return execSync(`git ${args}`, {cwd, stdio: ['ignore', 'pipe', 'ignore']})
            .toString('utf-8')
            .trim();
    } catch {
        return null;
    }
}

function readBakedGitInfo() {
    try {
        return JSON.parse(fs.readFileSync(BAKED_GIT_INFO_PATH, 'utf-8'));
    } catch {
        return null;
    }
}

function getLiveGitInfo(projectRoot) {
    const commit = safeGitCommand('rev-parse --short HEAD', projectRoot);
    const branch = safeGitCommand('rev-parse --abbrev-ref HEAD', projectRoot);
    const status = safeGitCommand('status --porcelain', projectRoot);

    return {
        commit: commit || null,
        branch: branch || null,
        dirty: status ? status.length > 0 : null
    };
}

function getAppInfo({appVersion, projectRoot, isDev}) {
    const gitInfo = isDev ? getLiveGitInfo(projectRoot) : readBakedGitInfo();

    return {
        version: appVersion,
        commit: gitInfo?.commit || null,
        branch: gitInfo?.branch || null,
        dirty: typeof gitInfo?.dirty === 'boolean' ? gitInfo.dirty : null,
        isDev: !!isDev
    };
}

module.exports = {getAppInfo};