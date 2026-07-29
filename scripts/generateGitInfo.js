import {execSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
const branch = safeGitCommand('describe --tags --exact-match') || safeGitCommand('rev-parse --abbrev-ref HEAD');
const status = safeGitCommand('status --porcelain');

const gitInfo = {
    commit: commit || null,
    branch: branch || null,
    generatedAt: new Date().toISOString()
};

fs.writeFileSync(outFile, JSON.stringify(gitInfo, null, 2) + '\n', 'utf-8');
console.log(`[generateGitInfo] wrote ${path.relative(projectRoot, outFile)}`);