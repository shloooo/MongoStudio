import {app} from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import {promises as fsPromises} from 'node:fs';
import crypto from 'node:crypto';
import {pipeline} from 'node:stream';
import util from 'node:util';
import log from 'electron-log';

const pipelineAsync = util.promisify(pipeline);

export function getLocalAppDataFolder(): string {
    return path.join(app.getPath('home'), 'AppData', 'Local');
}

export function getAppFolder(): string {
    return `${getLocalAppDataFolder()}\\MongoStudio`;
}

export function getLogFolder(): string {
    return `${getAppFolder()}\\logs`;
}

export function formatBytes(bytes: number): string {
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

export function escapeStringRegexp(string: string): string {
    return string
        .replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
        .replace(/-/g, '\\x2d');
}

export async function pathExists(target: string): Promise<boolean> {
    try {
        await fsPromises.access(target);
        return true;
    } catch {
        return false;
    }
}

export function pathExistsSync(target: string): boolean {
    try {
        fs.accessSync(target);
        return true;
    } catch {
        return false;
    }
}

export function fileExistsSync(filePath: string): boolean {
    try {
        const fullPath = path.resolve(filePath);
        fs.accessSync(fullPath, fs.constants.F_OK);
        return true;
    } catch (err) {
        return false;
    }
}

export async function hashFile(filePath: string, algorithm = 'sha1'): Promise<string | undefined> {
    if (!fileExistsSync(filePath)) {
        return Promise.resolve(undefined);
    }

    if (filePath.endsWith('.asar')) {
        process.noAsar = true;
    }

    const stats = await fs.promises.stat(filePath);
    const fileSize = stats.size;

    let blockSize: number;
    if (fileSize < 1024 * 1024) {
        blockSize = 64 * 1024;
    } else if (fileSize < 100 * 1024 * 1024) {
        blockSize = 512 * 1024;
    } else if (fileSize < 1024 * 1024 * 1024) {
        blockSize = 4 * 1024 * 1024;
    } else {
        blockSize = 8 * 1024 * 1024;
    }

    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(filePath, {highWaterMark: blockSize});

    try {
        await pipelineAsync(stream, hash);
        if (filePath.endsWith('.asar')) {
            process.noAsar = false;
        }
        return hash.digest('hex');
    } catch (error: any) {
        log.error(`Could not hash file ${filePath} with ${algorithm}`);
        throw new Error(`Error hashing file: ${error.message}`);
    }
}

export function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export class FileUtils {
    static formatDateForFile(date: Date = new Date()): string {
        const year = String(date.getFullYear()).slice(-2);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        const hour = String(date.getHours()).padStart(2, '0');
        const minute = String(date.getMinutes()).padStart(2, '0');
        const second = String(date.getSeconds()).padStart(2, '0');

        return `${year}-${month}-${day}_${hour}-${minute}-${second}`;
    }
}