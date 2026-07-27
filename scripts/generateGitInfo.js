const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const outFile = path.join(projectRoot, 'src', 'main', 'gitInfo.generated.json');

function safeGitCommand(args) {
    try {
        return execSync(`git ${args}`, {cwd: projectRoot, stdio: ['ignore', 'pipe', 'ignore']})
            .toString('utf-8')
            .trim();
    } catch {
        return null;
    }
}

const commit = safeGitCommand('rev-parse --short HEAD');
const branch = safeGitCommand('rev-parse --abbrev-ref HEAD');
const status = safeGitCommand('status --porcelain');

const gitInfo = {
    commit: commit || null,
    branch: branch || null,
    dirty: false,
    generatedAt: new Date().toISOString()
};

fs.writeFileSync(outFile, JSON.stringify(gitInfo, null, 2) + '\n', 'utf-8');
console.log(`[generateGitInfo] wrote ${path.relative(projectRoot, outFile)}`);