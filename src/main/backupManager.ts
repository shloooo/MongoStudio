import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {EJSON} from 'bson';
import {BrowserWindow, dialog, type IpcMain} from 'electron';
import * as tar from 'tar';
import {getClient} from './connectionManager.js';
import {getAppFolder} from './utils/fs.utils.js';

const EXCLUDED_DATABASES = new Set(['admin', 'config', 'local']);
const cancelledBackupRequests = new Set<string>();

class BackupCancelledError extends Error {
    constructor() {
        super('CANCELLED');
        this.name = 'BackupCancelledError';
    }
}

function sanitizeForPath(name: string): string {
    return name.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function backupsRoot(): string {
    return path.join(getAppFolder(), 'backups');
}

interface BackupManifest {
    connId: string;
    connLabel: string;
    createdAt: string;
    databases: { name: string; collections: string[] }[];
}

async function collectBackupableDatabases(connId: string): Promise<string[]> {
    const client = getClient(connId);
    const result = await client.db().admin().listDatabases();
    return result.databases
        .map((d) => d.name)
        .filter((name) => !EXCLUDED_DATABASES.has(name));
}

interface BackupableCollection {
    name: string;
    count: number;
}

interface BackupableDatabase {
    name: string;
    collections: BackupableCollection[];
}

async function collectBackupableDatabasesWithCollections(connId: string): Promise<BackupableDatabase[]> {
    const client = getClient(connId);
    const dbNames = await collectBackupableDatabases(connId);
    const result: BackupableDatabase[] = [];
    for (const dbName of dbNames) {
        const db = client.db(dbName);
        const cols = (await db.listCollections().toArray()).filter((c) => c.type === 'collection');
        const collections: BackupableCollection[] = await Promise.all(cols.map(async (c) => {
            let count = 0;
            try {
                count = await db.collection(c.name).estimatedDocumentCount();
            } catch {
                count = 0;
            }
            return {name: c.name, count};
        }));
        collections.sort((a, b) => a.name.localeCompare(b.name));
        result.push({name: dbName, collections});
    }
    return result;
}

type BackupSelection = Record<string, string[]>;

interface BackupProgress {
    db: string;
    collection: string;
    doneCount: number;
    totalCount: number;
}

async function writeBackupToDir(connId: string, connLabel: string, targetDir: string, requestId: string, selection: BackupSelection | undefined, onProgress?: (info: BackupProgress) => void): Promise<BackupManifest> {
    const client = getClient(connId);
    const allDbNames = await collectBackupableDatabases(connId);
    const dbNames = selection ? allDbNames.filter((name) => (selection[name] || []).length > 0) : allDbNames;
    const manifest: BackupManifest = {
        connId,
        connLabel,
        createdAt: new Date().toISOString(),
        databases: []
    };

    const dbCollections: { dbName: string; collections: string[] }[] = [];
    let totalCount = 0;
    for (const dbName of dbNames) {
        const db = client.db(dbName);
        let collections = (await db.listCollections().toArray())
            .filter((c) => c.type === 'collection')
            .map((c) => c.name);
        if (selection) {
            const wanted = new Set(selection[dbName] || []);
            collections = collections.filter((name) => wanted.has(name));
        }
        dbCollections.push({dbName, collections});
        totalCount += collections.length;
    }

    let doneCount = 0;
    for (const {dbName, collections} of dbCollections) {
        const db = client.db(dbName);
        const dbDir = path.join(targetDir, sanitizeForPath(dbName));
        fs.mkdirSync(dbDir, {recursive: true});

        for (const collName of collections) {
            if (cancelledBackupRequests.has(requestId)) throw new BackupCancelledError();
            if (onProgress) onProgress({db: dbName, collection: collName, doneCount, totalCount});
            const docs = await db.collection(collName).find({}).toArray();
            const serialized = EJSON.stringify(docs, undefined, 2);
            fs.writeFileSync(path.join(dbDir, `${sanitizeForPath(collName)}.json`), serialized, 'utf-8');
            doneCount++;
        }
        manifest.databases.push({name: dbName, collections});
    }

    fs.writeFileSync(path.join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
    return manifest;
}

async function restoreFromDir(targetConnId: string, sourceDir: string, requestId: string, dbNameMap?: Record<string, string>, onProgress?: (info: BackupProgress) => void): Promise<{
    restoredDocs: number;
    databases: string[]
}> {
    const manifestPath = path.join(sourceDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) throw new Error('manifest.json not found in backup');
    const manifest: BackupManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    const client = getClient(targetConnId);
    let restoredDocs = 0;
    const restoredDbs: string[] = [];
    const totalCount = manifest.databases.reduce((sum, d) => sum + d.collections.length, 0);
    let doneCount = 0;

    for (const dbEntry of manifest.databases) {
        const targetDbName = dbNameMap?.[dbEntry.name] || dbEntry.name;
        if (EXCLUDED_DATABASES.has(targetDbName)) continue; // never restore into system DBs
        const db = client.db(targetDbName);
        const dbDir = path.join(sourceDir, sanitizeForPath(dbEntry.name));

        for (const collName of dbEntry.collections) {
            if (cancelledBackupRequests.has(requestId)) throw new BackupCancelledError();
            if (onProgress) onProgress({db: targetDbName, collection: collName, doneCount, totalCount});
            const filePath = path.join(dbDir, `${sanitizeForPath(collName)}.json`);
            if (fs.existsSync(filePath)) {
                const raw = fs.readFileSync(filePath, 'utf-8');
                const docs = EJSON.parse(raw);
                if (Array.isArray(docs) && docs.length > 0) {
                    const result = await db.collection(collName).insertMany(docs, {ordered: false});
                    restoredDocs += result.insertedCount;
                }
            }
            doneCount++;
        }
        restoredDbs.push(targetDbName);
    }

    return {restoredDocs, databases: restoredDbs};
}

export function registerBackupHandlers(ipcMain: IpcMain): void {
    ipcMain.handle('backup:listDatabases', async (event, {connId}) => {
        return collectBackupableDatabases(connId);
    });

    ipcMain.handle('backup:listCollections', async (event, {connId}) => {
        return collectBackupableDatabasesWithCollections(connId);
    });

    ipcMain.handle('backup:cancel', async (event, {requestId}) => {
        cancelledBackupRequests.add(requestId);
        return true;
    });

    ipcMain.handle('backup:createInternal', async (event, {connId, connLabel, requestId, selection}) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const dirName = `${sanitizeForPath(connLabel || connId)}_${timestamp}`;
        const targetDir = path.join(backupsRoot(), dirName);
        fs.mkdirSync(targetDir, {recursive: true});
        const win = BrowserWindow.getFocusedWindow();
        try {
            const manifest = await writeBackupToDir(connId, connLabel, targetDir, requestId, selection, (info) => {
                win?.webContents.send('backup:progress', {connId, requestId, phase: 'collection', ...info});
            });
            return {ok: true, id: dirName, manifest};
        } catch (err: any) {
            if (err instanceof BackupCancelledError) {
                fs.rmSync(targetDir, {recursive: true, force: true});
                return {ok: false, cancelled: true};
            }
            throw err;
        } finally {
            cancelledBackupRequests.delete(requestId);
        }
    });

    ipcMain.handle('backup:listInternal', async () => {
        const root = backupsRoot();
        if (!fs.existsSync(root)) return [];
        const entries = fs.readdirSync(root, {withFileTypes: true}).filter((e) => e.isDirectory());
        const result: any[] = [];
        for (const entry of entries) {
            const manifestPath = path.join(root, entry.name, 'manifest.json');
            if (!fs.existsSync(manifestPath)) continue;
            try {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                result.push({id: entry.name, ...manifest});
            } catch {
                // skip corrupt entries
            }
        }
        return result.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    });

    ipcMain.handle('backup:deleteInternal', async (event, {id}) => {
        const target = path.join(backupsRoot(), sanitizeForPath(id));
        if (!target.startsWith(backupsRoot())) throw new Error('Invalid backup id');
        fs.rmSync(target, {recursive: true, force: true});
        return {ok: true};
    });

    ipcMain.handle('backup:restoreInternal', async (event, {id, targetConnId, dbNameMap, requestId}) => {
        const sourceDir = path.join(backupsRoot(), sanitizeForPath(id));
        if (!sourceDir.startsWith(backupsRoot())) throw new Error('Invalid backup id');
        const win = BrowserWindow.getFocusedWindow();
        try {
            const result = await restoreFromDir(targetConnId, sourceDir, requestId, dbNameMap, (info) => {
                win?.webContents.send('backup:progress', {
                    connId: targetConnId,
                    requestId,
                    phase: 'collection', ...info
                });
            });
            return {ok: true, ...result};
        } catch (err: any) {
            if (err instanceof BackupCancelledError) return {ok: false, cancelled: true};
            throw err;
        } finally {
            cancelledBackupRequests.delete(requestId);
        }
    });

    ipcMain.handle('backup:createExternal', async (event, {connId, connLabel, requestId, selection}) => {
        const win = BrowserWindow.getFocusedWindow();
        const {canceled, filePath} = await dialog.showSaveDialog(win!, {
            defaultPath: `${sanitizeForPath(connLabel || connId)}-backup.tar.gz`,
            filters: [{name: 'Backup Archive', extensions: ['tar.gz']}]
        });
        if (canceled || !filePath) return {ok: false};

        const tmpDir = path.join(getAppFolder(), 'tmp', `backup-${crypto.randomUUID()}`);
        fs.mkdirSync(tmpDir, {recursive: true});
        try {
            const manifest = await writeBackupToDir(connId, connLabel, tmpDir, requestId, selection, (info) => {
                win?.webContents.send('backup:progress', {connId, requestId, phase: 'collection', ...info});
            });
            if (cancelledBackupRequests.has(requestId)) return {ok: false, cancelled: true};
            await tar.c({gzip: true, file: filePath, cwd: tmpDir}, fs.readdirSync(tmpDir));
            return {ok: true, filePath, manifest};
        } catch (err: any) {
            if (err instanceof BackupCancelledError) return {ok: false, cancelled: true};
            throw err;
        } finally {
            cancelledBackupRequests.delete(requestId);
            fs.rmSync(tmpDir, {recursive: true, force: true});
        }
    });

    ipcMain.handle('backup:restoreExternal', async (event, {targetConnId, dbNameMap, requestId}) => {
        const win = BrowserWindow.getFocusedWindow();
        const {canceled, filePaths} = await dialog.showOpenDialog(win!, {
            properties: ['openFile'],
            filters: [{name: 'Backup Archive', extensions: ['tar.gz', 'gz']}]
        });
        if (canceled || !filePaths.length) return {ok: false};

        const tmpDir = path.join(getAppFolder(), 'tmp', `restore-${crypto.randomUUID()}`);
        fs.mkdirSync(tmpDir, {recursive: true});
        try {
            await tar.x({file: filePaths[0], cwd: tmpDir});
            const result = await restoreFromDir(targetConnId, tmpDir, requestId, dbNameMap, (info) => {
                win?.webContents.send('backup:progress', {
                    connId: targetConnId,
                    requestId,
                    phase: 'collection', ...info
                });
            });
            return {ok: true, ...result};
        } catch (err: any) {
            if (err instanceof BackupCancelledError) return {ok: false, cancelled: true};
            throw err;
        } finally {
            cancelledBackupRequests.delete(requestId);
            fs.rmSync(tmpDir, {recursive: true, force: true});
        }
    });
}