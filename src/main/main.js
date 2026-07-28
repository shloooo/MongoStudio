const {app, BrowserWindow, ipcMain} = require('electron');
const path = require('path');
const SecureStore = require('./secureStore');
const {registerConnectionHandlers} = require('./connectionManager');
const {registerDataHandlers} = require('./dataHandlers');
const {registerSettingsHandlers} = require('./settingsStore');
const {startStaticServer} = require('./staticServer');
const {ApplicationUtils} = require("./utils/arg.utils");
const {getAppInfo} = require('./appInfo');
const {initUpdater, checkForUpdates, downloadUpdate, quitAndInstall, getState} = require('./updater');

let mainWindow;
let store;
let settingsStore;
let dataHandlersRegistered = false;
let staticServerHandle = null;
const isServeMode = ApplicationUtils.getArg('serve') != undefined;
const isRendererDevMode = ApplicationUtils.getArg('render-dev') != undefined;

async function createWindow() {
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
            preload: path.join(__dirname, '..', 'preload', 'preload.js'),
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
        mainWindow.loadURL('http://localhost:5173');
    } else {
        if (!staticServerHandle) {
            staticServerHandle = await startStaticServer(path.join(__dirname, '..', '..', 'dist'));
        }
        mainWindow.loadURL(staticServerHandle.url);
    }
}

function ensureDataHandlersRegistered() {
    if (dataHandlersRegistered) return;
    registerConnectionHandlers(ipcMain, store);
    registerDataHandlers(ipcMain);
    dataHandlersRegistered = true;
}

app.whenReady().then(async () => {
    store = new SecureStore({name: 'mongo-studio-connections', cwd: app.getPath('userData')});
    settingsStore = registerSettingsHandlers(ipcMain, app.getPath('userData'), store);
    await createWindow();

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

    ipcMain.handle('vault:unlock', (event, passphrase) => {
        const ok = store.unlock(passphrase);
        if (ok) ensureDataHandlersRegistered();
        return ok;
    });

    ipcMain.handle('vault:setup', (event, passphrase) => {
        store.enableEncryption(passphrase);
        ensureDataHandlersRegistered();
        return true;
    });

    ipcMain.handle('vault:disable', (event, currentPassphrase) => {
        if (store.isEncryptionEnabled() && !store.unlock(currentPassphrase)) return false;
        store.disableEncryption();
        return true;
    });

    ipcMain.handle('vault:changePassphrase', (event, {current, next}) => {
        if (!store.unlock(current)) return false;
        store.enableEncryption(next);
        return true;
    });

    ipcMain.handle('vault:reset', () => {
        SecureStore.resetAll('mongo-studio-connections', app.getPath('userData'));
        store = new SecureStore({name: 'mongo-studio-connections', cwd: app.getPath('userData')});
        dataHandlersRegistered = false;
        ensureDataHandlersRegistered();
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
        projectRoot: app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', '..'),
        isDev: isServeMode
    }));

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

function forwardErrorToRenderer(message) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('app:error', message);
    }
}

process.on('uncaughtException', (err) => {
    console.error(err);
    forwardErrorToRenderer(err && err.message ? err.message : String(err));
});

process.on('unhandledRejection', (reason) => {
    console.error(reason);
    forwardErrorToRenderer(reason && reason.message ? reason.message : String(reason));
});