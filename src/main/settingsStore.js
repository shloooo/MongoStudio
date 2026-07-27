const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');

class SettingsFile {
  constructor(cwd) {
    this.filePath = path.join(cwd, 'mongo-studio-settings.json');
    this.data = this._load();
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
    } catch {
      return { language: 'en', defaultEditorTab: 'tree' };
    }
  }

  _persist() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  get(key, defaultValue) {
    return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : defaultValue;
  }

  set(key, value) {
    this.data[key] = value;
    this._persist();
  }
}

function registerSettingsHandlers(ipcMain, userDataPath, connectionStore) {
  const settings = new SettingsFile(userDataPath);

  ipcMain.handle('settings:get', () => settings.data);

  ipcMain.handle('settings:set', (event, { key, value }) => {
    settings.set(key, value);
    return settings.data;
  });

  // Exports settings + (decrypted, in-memory) connections to a single JSON file the user picks.
  ipcMain.handle('settings:export', async (event, { connections }) => {
    const win = require('electron').BrowserWindow.getFocusedWindow();
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: 'mongostudio-export.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (canceled || !filePath) return { ok: false };
    const payload = {
      exportedAt: new Date().toISOString(),
      settings: settings.data,
      connections
    };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    return { ok: true, filePath };
  });

  // Imports a previously exported settings+connections JSON file. Connections are merged by id
  // (imported entries overwrite existing ones with the same id, others are appended).
  ipcMain.handle('settings:import', async () => {
    const win = require('electron').BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (canceled || !filePaths.length) return { ok: false };
    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(filePaths[0], 'utf-8'));
    } catch (err) {
      return { ok: false, error: `Could not parse file: ${err.message}` };
    }

    if (payload.settings && typeof payload.settings === 'object') {
      for (const [key, value] of Object.entries(payload.settings)) {
        settings.set(key, value);
      }
    }

    let importedConnectionCount = 0;
    if (Array.isArray(payload.connections) && connectionStore) {
      if (connectionStore.isEncryptionEnabled() && !connectionStore.isUnlocked()) {
        return { ok: false, error: 'Vault is locked; cannot import connections.' };
      }
      const existing = connectionStore.get('connections', []);
      const byId = new Map(existing.map((c) => [c.id, c]));
      for (const conn of payload.connections) {
        if (!conn.id) continue;
        byId.set(conn.id, conn);
        importedConnectionCount++;
      }
      connectionStore.set('connections', Array.from(byId.values()));
    }

    return { ok: true, settings: settings.data, importedConnectionCount };
  });

  return settings;
}

module.exports = { registerSettingsHandlers, SettingsFile };