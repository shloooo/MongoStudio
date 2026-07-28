const fs = require("node:fs");
const {getLogFolder, FileUtils} = require("../utils/fs.utils");
const log = require("electron-log");
const path = require("node:path");
const {app} = require("electron");

class LogStart {

    static setup() {
        if (!fs.existsSync(getLogFolder())) {
            fs.mkdirSync(getLogFolder());
        }
        this.clearOldLogFiles()
        log.transports.file.resolvePathFn = () => path.join(getLogFolder(), `launcher_${FileUtils.formatDateForFile()}.log`);
        app.setAppLogsPath(getLogFolder());
    }

    static clearOldLogFiles(logDir = getLogFolder(), maxFiles = 10) {
        fs.readdir(logDir, (err, files) => {
            if (err) return console.error('Could not read log directory:', err);

            const logFiles = files.filter(file => file.endsWith('.log'));

            logFiles.sort((a, b) => {
                return Number(fs.statSync(path.join(logDir, a)).mtime) - Number(fs.statSync(path.join(logDir, b)).mtime);
            });

            while (logFiles.length > maxFiles) {
                const fileToDelete = path.join(logDir, logFiles.shift());
                fs.unlinkSync(fileToDelete);
            }
        });
    }
}

module.exports = {LogStart};