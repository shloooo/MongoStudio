import {MongoClient} from 'mongodb';
import crypto from 'node:crypto';
import {BrowserWindow, dialog, type IpcMain} from 'electron';
import {closeTunnel, openTunnel, type SshConfig, type SshTunnel} from './sshTunnel.js';
import type SecureStore from './secureStore.js';

export interface ConnectionConfig {
    id: string;
    uri?: string;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    authSource?: string;
    tls?: boolean;
    replicaSet?: string;
    directConnection?: boolean;
    useSsh?: boolean;
    srv?: boolean;
    ssh: SshConfig;
}

const activeClients = new Map<string, MongoClient>();
const activeTunnels = new Map<string, SshTunnel>();

function describeError(err: any): string {
    if (!err) return 'Unknown error';
    if (err.message) return err.message;
    if (Array.isArray(err.errors) && err.errors.length) {
        const sub = err.errors.map((e: any) => (e && e.message) || String(e)).filter(Boolean);
        if (sub.length) return sub.join('; ');
    }
    return String(err);
}

function isDeadConnectionError(err: any): boolean {
    if (!err) return false;
    if (err.name === 'MongoServerSelectionError' || err.name === 'MongoNetworkError') return true;
    return /server selection|topology.*closed|connection.*closed/i.test(err.message || '');
}

async function cleanupClient(id: string): Promise<void> {
    if (activeClients.has(id)) {
        await activeClients.get(id)!.close().catch(() => {
        });
        activeClients.delete(id);
    }
    if (activeTunnels.has(id)) {
        closeTunnel(activeTunnels.get(id));
        activeTunnels.delete(id);
    }
}

function notifyDisconnected(id: string): void {
    for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('conn:disconnected', id);
    }
}

function buildUri(conn: ConnectionConfig, override?: { host: string; port: number }): string {
    if (conn.uri && !override) return conn.uri;
    const host = override ? override.host : (conn.host || 'localhost');
    const port = override ? override.port : (conn.port || 27017);
    const auth = conn.username ? `${encodeURIComponent(conn.username)}:${encodeURIComponent(conn.password!)}@` : '';
    const opts: string[] = [];
    if (conn.authSource) opts.push(`authSource=${conn.authSource}`);
    if (conn.tls) opts.push('tls=true');
    if (conn.replicaSet && !conn.useSsh) opts.push(`replicaSet=${conn.replicaSet}`);
    if (conn.directConnection || conn.useSsh) opts.push('directConnection=true');
    const query = opts.length ? `?${opts.join('&')}` : '';
    const srv = conn.srv && !conn.useSsh;
    const scheme = srv ? 'mongodb+srv' : 'mongodb';
    const hostPart = srv ? host : `${host}:${port}`;
    return `${scheme}://${auth}${hostPart}/${query}`;
}

async function resolveConnection(conn: ConnectionConfig): Promise<{ uri: string; tunnel: SshTunnel | null }> {
    if (!conn.useSsh) {
        return {uri: buildUri(conn), tunnel: null};
    }
    const targetHost = conn.host || 'localhost';
    const targetPort = conn.port || 27017;
    const tunnel = await openTunnel(conn.ssh, targetHost, targetPort);
    const uri = buildUri(conn, {host: '127.0.0.1', port: tunnel.localPort});
    return {uri, tunnel};
}

export function registerConnectionHandlers(ipcMain: IpcMain, store: SecureStore): void {
    ipcMain.handle('conn:list', () => {
        return store.get('connections', []);
    });

    ipcMain.handle('conn:get', (event, id) => {
        const conns = store.get('connections', []);
        return conns.find((c: ConnectionConfig) => c.id === id) || null;
    });

    ipcMain.handle('conn:save', (event, conn: ConnectionConfig) => {
        const conns = store.get('connections', []);
        if (!conn.id) conn.id = crypto.randomUUID();
        const idx = conns.findIndex((c: ConnectionConfig) => c.id === conn.id);
        if (idx >= 0) conns[idx] = conn;
        else conns.push(conn);
        store.set('connections', conns);
        return conn;
    });

    ipcMain.handle('conn:delete', async (event, id: string) => {
        const conns = store.get('connections', []).filter((c: ConnectionConfig) => c.id !== id);
        store.set('connections', conns);
        await cleanupClient(id);
        return true;
    });

    ipcMain.handle('conn:test', async (event, conn: ConnectionConfig) => {
        let tunnel: SshTunnel | null = null;
        try {
            const resolved = await resolveConnection(conn);
            tunnel = resolved.tunnel;
            const client = new MongoClient(resolved.uri, {serverSelectionTimeoutMS: 6000});
            try {
                await client.connect();
                await client.db('admin').command({ping: 1});
                return {ok: true};
            } finally {
                await client.close().catch(() => {
                });
            }
        } catch (err) {
            return {ok: false, error: describeError(err)};
        } finally {
            closeTunnel(tunnel);
        }
    });

    ipcMain.handle('conn:open', async (event, conn: ConnectionConfig) => {
        if (activeClients.has(conn.id)) {
            return {ok: true, alreadyOpen: true};
        }
        try {
            const {uri, tunnel} = await resolveConnection(conn);
            const client = new MongoClient(uri, {serverSelectionTimeoutMS: 10000});
            await client.connect();
            activeClients.set(conn.id, client);
            if (tunnel) activeTunnels.set(conn.id, tunnel);
            return {ok: true};
        } catch (err) {
            return {ok: false, error: describeError(err)};
        }
    });

    ipcMain.handle('conn:close', async (event, id: string) => {
        await cleanupClient(id);
        return true;
    });

    ipcMain.handle('conn:listDatabases', async (event, id: string) => {
        const client = activeClients.get(id);
        if (!client) throw new Error('Connection is not open');
        try {
            const result = await client.db().admin().listDatabases();
            return result.databases.map((d) => ({name: d.name, sizeOnDisk: d.sizeOnDisk}));
        } catch (err) {
            if (isDeadConnectionError(err)) {
                await cleanupClient(id);
                notifyDisconnected(id);
                throw new Error('Connection lost. Please reconnect.');
            }
            throw err;
        }
    });

    ipcMain.handle('conn:listCollections', async (event, {connId, dbName}: { connId: string; dbName: string }) => {
        const client = activeClients.get(connId);
        if (!client) throw new Error('Connection is not open');
        try {
            const cols = await client.db(dbName).listCollections().toArray();
            return cols.map((c) => ({name: c.name, type: c.type}));
        } catch (err) {
            if (isDeadConnectionError(err)) {
                await cleanupClient(connId);
                notifyDisconnected(connId);
                throw new Error('Connection lost. Please reconnect.');
            }
            throw err;
        }
    });

    ipcMain.handle('conn:createDatabase', async (event, {connId, dbName, collection}: {
        connId: string;
        dbName: string;
        collection?: string;
    }) => {
        const client = activeClients.get(connId);
        if (!client) throw new Error('Connection is not open');
        try {
            await client.db(dbName).createCollection(collection || 'collection1');
            return true;
        } catch (err) {
            if (isDeadConnectionError(err)) {
                await cleanupClient(connId);
                notifyDisconnected(connId);
                throw new Error('Connection lost. Please reconnect.');
            }
            throw err;
        }
    });

    ipcMain.handle('conn:pickPrivateKey', async () => {
        const {canceled, filePaths} = await dialog.showOpenDialog({
            properties: ['openFile'],
            title: 'Select SSH Private Key'
        });
        if (canceled || !filePaths.length) return null;
        return filePaths[0];
    });
}

export function getClient(id: string): MongoClient {
    const client = activeClients.get(id);
    if (!client) throw new Error('Connection is not open. Please connect first.');
    return client;
}

export {buildUri};