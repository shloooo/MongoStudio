const {autoUpdater} = require('electron-updater');

let mainWindow = null;
let isDev = false;
let checking = false;
let downloading = false;
let lastCheckResult = null;

function send(channel, payload) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, payload);
    }
}

function formatEtaSeconds(bytesPerSecond, bytesRemaining) {
    if (!bytesPerSecond || bytesPerSecond <= 0) return null;
    return Math.round(bytesRemaining / bytesPerSecond);
}

function initUpdater({window, devMode}) {
    mainWindow = window;
    isDev = devMode;

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on('checking-for-update', () => {
        send('updater:event', {type: 'checking'});
    });

    autoUpdater.on('update-available', (info) => {
        checking = false;
        lastCheckResult = {updateAvailable: true, version: info.version};
        send('updater:event', {type: 'available', version: info.version, releaseNotes: info.releaseNotes || null});
    });

    autoUpdater.on('update-not-available', (info) => {
        checking = false;
        lastCheckResult = {updateAvailable: false, version: info.version};
        send('updater:event', {type: 'not-available', version: info.version});
    });

    autoUpdater.on('error', (err) => {
        checking = false;
        downloading = false;
        send('updater:event', {type: 'error', message: err && err.message ? err.message : String(err)});
    });

    autoUpdater.on('download-progress', (progress) => {
        const bytesRemaining = progress.total - progress.transferred;
        send('updater:event', {
            type: 'downloading',
            percent: progress.percent,
            transferred: progress.transferred,
            total: progress.total,
            bytesPerSecond: progress.bytesPerSecond,
            etaSeconds: formatEtaSeconds(progress.bytesPerSecond, bytesRemaining)
        });
    });

    autoUpdater.on('update-downloaded', (info) => {
        downloading = false;
        send('updater:event', {type: 'downloaded', version: info.version});
    });
}

async function checkForUpdates() {
    if (isDev) {
        return {ok: false, error: 'Update checks are disabled in development mode.'};
    }
    if (checking) return {ok: true, alreadyChecking: true};
    checking = true;
    try {
        await autoUpdater.checkForUpdates();
        return {ok: true};
    } catch (err) {
        checking = false;
        return {ok: false, error: err.message};
    }
}

async function downloadUpdate() {
    if (isDev) {
        return {ok: false, error: 'Updates are disabled in development mode.'};
    }
    if (downloading) return {ok: true, alreadyDownloading: true};
    downloading = true;
    try {
        await autoUpdater.downloadUpdate();
        return {ok: true};
    } catch (err) {
        downloading = false;
        return {ok: false, error: err.message};
    }
}

function quitAndInstall() {
    autoUpdater.quitAndInstall();
}

function getState() {
    return {checking, downloading, lastCheckResult, isDev};
}

module.exports = {initUpdater, checkForUpdates, downloadUpdate, quitAndInstall, getState};