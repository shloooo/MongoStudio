import {app, BrowserWindow, dialog, ipcMain} from 'electron';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import log from 'electron-log';
import SecureStore from './secureStore.js';
import {registerConnectionHandlers} from './connectionManager.js';
import {registerDataHandlers} from './dataHandlers.js';
import {registerBackupHandlers} from './backupManager.js';
import {registerSettingsHandlers, type SettingsFile} from './settingsStore.js';
import {markSetupCompleted, shouldShowSetup} from './firstRun.js';
import {startStaticServer, type StaticServerHandle} from './staticServer.js';
import {ApplicationUtils} from './utils/arg.utils.js';
import {getAppInfo} from './appInfo.js';
import {checkForUpdates, downloadUpdate, getState, initUpdater, quitAndInstall} from './updater.js';
import {LogStart} from './start/log.start.js';
import {SystemUtils} from './utils/sys.utils.js';
import {getAppFolder} from './utils/fs.utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow;
let store: SecureStore;
let settingsStore: SettingsFile;
let dataHandlersRegistered = false;
let staticServerHandle: StaticServerHandle | null = null;
const isServeMode = ApplicationUtils.getArg('serve') != undefined;
const isRendererDevMode = ApplicationUtils.getArg('render-dev') != undefined;

if (!fs.existsSync(getAppFolder())) {
    fs.mkdirSync(getAppFolder());
}

LogStart.setup();
app.setName('MongoStudio');

async function createWindow(): Promise<void> {
    const serve = isServeMode;

    mainWindow = new BrowserWindow({
        width: 1440,
        height: 920,
        minWidth: 1000,
        minHeight: 600,
        frame: false,
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
        trafficLightPosition: process.platform === 'darwin' ? {x: 16, y: 13} : undefined,
        backgroundColor: '#00000000',
        transparent: process.platform !== 'linux',
        vibrancy: process.platform === 'darwin' ? 'under-window' : undefined,
        visualEffectState: process.platform === 'darwin' ? 'active' : undefined,
        backgroundMaterial: process.platform === 'win32' ? 'acrylic' : undefined,
        webPreferences: {
            preload: path.join(__dirname, '..', 'src', 'preload', 'preload.js'),
            nodeIntegration: false,
            allowRunningInsecureContent: serve,
            contextIsolation: true,
            devTools: serve
        }
    });

    mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized', true));
    mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized', false));

    const isDev = !app.isPackaged;
    if (isDev && isRendererDevMode) {
        await mainWindow.loadURL('http://localhost:5173');
    } else {
        if (!staticServerHandle) {
            staticServerHandle = await startStaticServer(path.join(__dirname, '..', 'dist'));
        }
        await mainWindow.loadURL(staticServerHandle.url);
    }
}

function ensureDataHandlersRegistered(): void {
    if (dataHandlersRegistered) return;
    registerConnectionHandlers(ipcMain, store);
    registerDataHandlers(ipcMain);
    registerBackupHandlers(ipcMain);
    dataHandlersRegistered = true;
}

function getWindow(): BrowserWindow | undefined {
    return BrowserWindow.getAllWindows()[0];
}

try {
    const locked = app.requestSingleInstanceLock();

    if (!locked) {
        app.quit();
    } else {
        app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
            const win = getWindow();
            if (win != undefined) {
                if (win.isMinimized()) win.restore();
                win.focus();
            }
        });

        app.whenReady().then(async () => {
            log.info(`Starting MongoStudio v${app.getVersion()}`);
            log.info(`System: ${SystemUtils.getPlatform()} ${SystemUtils.getArchitecture()}`);

            const settingsPath = path.join(getAppFolder(), 'settings.json');
            const setupNeeded = shouldShowSetup(settingsPath);

            store = new SecureStore({name: 'connections', cwd: getAppFolder()});
            settingsStore = registerSettingsHandlers(ipcMain, getAppFolder(), store);
            await createWindow();

            ipcMain.handle('setup:needed', () => setupNeeded);

            ipcMain.handle('setup:complete', (event, {language, theme, encryption, passphrase}: {
                language: string;
                theme: 'light' | 'dark';
                encryption: 'encrypted' | 'unencrypted';
                passphrase?: string;
            }) => {
                settingsStore.set('language', language);
                settingsStore.set('theme', theme);

                if (encryption === 'encrypted' && passphrase) {
                    store.enableEncryption(passphrase);
                }

                ensureDataHandlersRegistered();
                markSetupCompleted();
                return {ok: true, settings: settingsStore.data};
            });

            initUpdater({window: mainWindow, devMode: isServeMode, settingsStore});

            ipcMain.handle('updater:check', () => checkForUpdates());
            ipcMain.handle('updater:download', () => downloadUpdate());
            ipcMain.handle('updater:quitAndInstall', () => quitAndInstall());
            ipcMain.handle('updater:getState', () => getState());

            if (!isServeMode) {
                setTimeout(() => checkForUpdates(), 3000);
            }

            ipcMain.handle('vault:status', () => ({
                encryptionEnabled: store.isEncryptionEnabled(),
                unlocked: store.isUnlocked()
            }));

            ipcMain.handle('vault:unlock', (event, passphrase: string) => {
                const ok = store.unlock(passphrase);
                if (ok) ensureDataHandlersRegistered();
                return ok;
            });

            ipcMain.handle('vault:setup', (event, passphrase: string) => {
                store.enableEncryption(passphrase);
                ensureDataHandlersRegistered();
                return true;
            });

            ipcMain.handle('vault:disable', (event, currentPassphrase: string) => {
                if (store.isEncryptionEnabled() && !store.unlock(currentPassphrase)) return false;
                store.disableEncryption();
                return true;
            });

            ipcMain.handle('vault:changePassphrase', (event, {current, next}: { current: string; next: string }) => {
                if (!store.unlock(current)) return false;
                store.enableEncryption(next);
                return true;
            });

            ipcMain.handle('vault:reset', () => {
                SecureStore.resetAll('connections', getAppFolder());
                store = new SecureStore({name: 'connections', cwd: getAppFolder()});
                app.relaunch();
                app.exit(0);
                return true;
            });

            if (!store.isEncryptionEnabled()) {
                ensureDataHandlersRegistered();
            }

            ipcMain.handle('window:minimize', () => mainWindow.minimize());
            ipcMain.handle('window:toggleMaximize', () => {
                if (mainWindow.isMaximized()) mainWindow.unmaximize();
                else mainWindow.maximize();
            });
            ipcMain.handle('window:close', () => mainWindow.close());
            ipcMain.handle('window:isMaximized', () => mainWindow.isMaximized());

            ipcMain.handle('app:getInfo', () => getAppInfo({
                appVersion: app.getVersion(),
                projectRoot: app.isPackaged ? process.resourcesPath : path.join(__dirname, '..'),
                isDev: isServeMode
            }));

            ipcMain.handle('app:relaunch', () => {
                app.relaunch();
                app.exit(0);
            });

            app.on('activate', () => {
                if (BrowserWindow.getAllWindows().length === 0) createWindow();
            });
        });

        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') app.quit();
        });

        function forwardErrorToRenderer(message: string): void {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('app:error', message);
            }
        }

        process.on('uncaughtException', (err) => {
            console.error(err);
            forwardErrorToRenderer(err && err.message ? err.message : String(err));
        });

        process.on('unhandledRejection', (reason: any) => {
            console.error(reason);
            forwardErrorToRenderer(reason && reason.message ? reason.message : String(reason));
        });
    }
} catch (e) {
    dialog.showMessageBox({
        type: 'error',
        title: 'Error',
        message: `MongoStudio encountered an error upon startup`,
        detail: `Errorcode:\n\n${e}`
    }).then(() => {
        app.exit(0xF2);
    });
}