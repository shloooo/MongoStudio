import fs from 'node:fs';
import {getLogFolder, FileUtils} from '../utils/fs.utils.js';
import log from 'electron-log';
import path from 'node:path';
import {app} from 'electron';

export class LogStart {

    static setup(): void {
        if (!fs.existsSync(getLogFolder())) {
            fs.mkdirSync(getLogFolder());
        }
        this.clearOldLogFiles();
        log.transports.file.resolvePathFn = () => path.join(getLogFolder(), `launcher_${FileUtils.formatDateForFile()}.log`);
        app.setAppLogsPath(getLogFolder());
    }

    static clearOldLogFiles(logDir: string = getLogFolder(), maxFiles = 10): void {
        fs.readdir(logDir, (err, files) => {
            if (err) return console.error('Could not read log directory:', err);

            const logFiles = files.filter(file => file.endsWith('.log'));

            logFiles.sort((a, b) => {
                return Number(fs.statSync(path.join(logDir, a)).mtime) - Number(fs.statSync(path.join(logDir, b)).mtime);
            });

            while (logFiles.length > maxFiles) {
                const fileToDelete = path.join(logDir, logFiles.shift()!);
                fs.unlinkSync(fileToDelete);
            }
        });
    }
}