const {execSync} = require('child_process');
const path = require('path');

function safeGitCommand(args, cwd) {
    try {
        return execSync(`git ${args}`, {cwd, stdio: ['ignore', 'pipe', 'ignore']})
            .toString('utf-8')
            .trim();
    } catch {
        return null;
    }
}

function getAppInfo({appVersion, projectRoot, isDev}) {
    const commit = safeGitCommand('rev-parse --short HEAD', projectRoot);
    const branch = safeGitCommand('rev-parse --abbrev-ref HEAD', projectRoot);
    const dirty = safeGitCommand('status --porcelain', projectRoot);

    return {
        version: appVersion,
        commit: commit || null,
        branch: branch || null,
        dirty: dirty ? dirty.length > 0 : null,
        isDev: !!isDev
    };
}

module.exports = {getAppInfo};
