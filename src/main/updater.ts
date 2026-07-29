import pkg from 'electron-updater';
const {autoUpdater} = pkg;
import type {BrowserWindow} from 'electron';
import type {SettingsFile} from './settingsStore.js';

let mainWindow: BrowserWindow | null = null;
let isDev = false;
let checking = false;
let downloading = false;
let lastCheckResult: { updateAvailable: boolean; version: string } | null = null;
let settingsStoreRef: SettingsFile | null = null;

function send(channel: string, payload: any): void {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, payload);
    }
}

function formatEtaSeconds(bytesPerSecond: number, bytesRemaining: number): number | null {
    if (!bytesPerSecond || bytesPerSecond <= 0) return null;
    return Math.round(bytesRemaining / bytesPerSecond);
}

export function initUpdater({window, devMode, settingsStore}: {
    window: BrowserWindow;
    devMode: boolean;
    settingsStore: SettingsFile | null;
}): void {
    mainWindow = window;
    isDev = devMode;
    settingsStoreRef = settingsStore || null;

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

export async function checkForUpdates(): Promise<{ ok: boolean; error?: string; alreadyChecking?: boolean }> {
    if (isDev) {
        return {ok: false, error: 'Update checks are disabled in development mode.'};
    }
    if (checking) return {ok: true, alreadyChecking: true};

    checking = true;
    const channel = settingsStoreRef ? settingsStoreRef.get('updateChannel', 'stable') : 'stable';

    autoUpdater.allowDowngrade = true;
    autoUpdater.allowPrerelease = (channel === 'canary');
    autoUpdater.channel = (channel === 'stable' ? 'latest' : channel);

    try {
        await autoUpdater.checkForUpdates();
        return {ok: true};
    } catch (err: any) {
        return {ok: false, error: err.message};
    } finally {
        checking = false;
    }
}

export async function downloadUpdate(): Promise<{ ok: boolean; error?: string; alreadyDownloading?: boolean }> {
    if (isDev) {
        return {ok: false, error: 'Updates are disabled in development mode.'};
    }
    if (downloading) return {ok: true, alreadyDownloading: true};
    downloading = true;
    try {
        await autoUpdater.downloadUpdate();
        return {ok: true};
    } catch (err: any) {
        downloading = false;
        return {ok: false, error: err.message};
    }
}

export function quitAndInstall(): void {
    autoUpdater.quitAndInstall();
}

export function getState() {
    return {checking, downloading, lastCheckResult, isDev};
}