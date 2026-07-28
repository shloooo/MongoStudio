const { app } = require('electron');
const path = require('path');
const fs = require('node:fs');
const { promises: fsPromises } = require('node:fs');
const crypto = require('crypto');
const { pipeline } = require('stream');
const util = require('node:util');
const log = require('electron-log');

const pipelineAsync = util.promisify(pipeline);

function getLocalAppDataFolder() {
    return path.join(app.getPath('home'), 'AppData', 'Local');
}

function getAppFolder() {
    return `${getLocalAppDataFolder()}\\MongoStudio`
}

function getLogFolder() {
    return `${getAppFolder()}\\logs`
}

function formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unitIndex = 0;

    while (bytes >= 1024 && unitIndex < units.length - 1) {
        bytes /= 1024;
        unitIndex++;
    }

    try {
        return `${bytes.toFixed(2)} ${units[unitIndex]}`;
    } catch (e) {
        return `${bytes} ${units[unitIndex]}`;
    }
}

function escapeStringRegexp(string) {
    // Escape characters with special meaning either inside or outside character sets.
    // Use a simple backslash escape when it’s always valid, and a `\xnn` escape when the simpler form would be disallowed by Unicode patterns’ stricter grammar.
    return string
        .replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
        .replace(/-/g, '\\x2d');
}

async function pathExists(path) {
    try {
        await fsPromises.access(path);
        return true;
    } catch {
        return false;
    }
}

function pathExistsSync(path) {
    try {
        fs.accessSync(path);
        return true;
    } catch {
        return false;
    }
}

function fileExistsSync(filePath) {
    try {
        const fullPath = path.resolve(filePath);
        fs.accessSync(fullPath, fs.constants.F_OK);
        return true;
    } catch (err) {
        return false;
    }
}

async function hashFile(filePath, algorithm = 'sha1') {
    if (!fileExistsSync(filePath)) {
        return Promise.resolve(undefined);
    }

    if (filePath.endsWith('.asar')) {
        process.noAsar = true;
    }

    const stats = await fs.promises.stat(filePath);
    const fileSize = stats.size;

    let blockSize = 0;
    if (fileSize < 1024 * 1024) { // < 1 MB
        blockSize = 64 * 1024; // 64 KB
    } else if (fileSize < 100 * 1024 * 1024) { // < 100 MB
        blockSize = 512 * 1024; // 512 KB
    } else if (fileSize < 1024 * 1024 * 1024) { // < 1 GB
        blockSize = 4 * 1024 * 1024; // 4 MB
    } else {
        blockSize = 8 * 1024 * 1024; // 8 MB
    }

    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(filePath, {highWaterMark: blockSize});

    try {
        await pipelineAsync(stream, hash);
        if (filePath.endsWith('.asar')) {
            process.noAsar = false;
        }
        return hash.digest('hex');
    } catch (error) {
        log.error(`Could not hash file ${filePath} with ${algorithm}`)
        throw new Error(`Error hashing file: ${error.message}`);
    }
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class FileUtils {
    static formatDateForFile(date = new Date()) {
        const year = String(date.getFullYear()).slice(-2);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        const hour = String(date.getHours()).padStart(2, '0');
        const minute = String(date.getMinutes()).padStart(2, '0');
        const second = String(date.getSeconds()).padStart(2, '0');

        return `${year}-${month}-${day}_${hour}-${minute}-${second}`;
    }
}

module.exports = {
    FileUtils,
    getLogFolder,
    getAppFolder,
    getLocalAppDataFolder,
    formatBytes,
    escapeStringRegexp,
    pathExists,
    pathExistsSync,
    fileExistsSync,
    hashFile,
    wait
}