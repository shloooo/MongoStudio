const { MongoClient } = require('mongodb');
const crypto = require('crypto');
const {BrowserWindow} = require('electron');
const { openTunnel, closeTunnel } = require('./sshTunnel');

const activeClients = new Map();
const activeTunnels = new Map();

function isDeadConnectionError(err) {
  if (!err) return false;
  if (err.name === 'MongoServerSelectionError' || err.name === 'MongoNetworkError') return true;
  return /server selection|topology.*closed|connection.*closed/i.test(err.message || '');
}

async function cleanupClient(id) {
  if (activeClients.has(id)) {
    await activeClients.get(id).close().catch(() => {
    });
    activeClients.delete(id);
  }
  if (activeTunnels.has(id)) {
    closeTunnel(activeTunnels.get(id));
    activeTunnels.delete(id);
  }
}

function notifyDisconnected(id) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('conn:disconnected', id);
  }
}

function buildUri(conn, override) {
  if (conn.uri && !override) return conn.uri;
  const host = override ? override.host : (conn.host || 'localhost');
  const port = override ? override.port : (conn.port || 27017);
  const auth = conn.username ? `${encodeURIComponent(conn.username)}:${encodeURIComponent(conn.password)}@` : '';
  const opts = [];
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

async function resolveConnection(conn) {
  if (!conn.useSsh) {
    return { uri: buildUri(conn), tunnel: null };
  }
  const targetHost = conn.host || 'localhost';
  const targetPort = conn.port || 27017;
  const tunnel = await openTunnel(conn.ssh, targetHost, targetPort);
  const uri = buildUri(conn, { host: '127.0.0.1', port: tunnel.localPort });
  return { uri, tunnel };
}

function registerConnectionHandlers(ipcMain, store) {
  ipcMain.handle('conn:list', () => {
    return store.get('connections', []);
  });

  // Kept for backward compatibility with the edit dialog - now equivalent to conn:list's per-item shape.
  ipcMain.handle('conn:get', (event, id) => {
    const conns = store.get('connections', []);
    return conns.find((c) => c.id === id) || null;
  });

  ipcMain.handle('conn:save', (event, conn) => {
    const conns = store.get('connections', []);
    if (!conn.id) conn.id = crypto.randomUUID();
    const idx = conns.findIndex((c) => c.id === conn.id);
    if (idx >= 0) conns[idx] = conn;
    else conns.push(conn);
    store.set('connections', conns);
    return conn;
  });

  ipcMain.handle('conn:delete', async (event, id) => {
    const conns = store.get('connections', []).filter((c) => c.id !== id);
    store.set('connections', conns);
    await cleanupClient(id);
    return true;
  });

  ipcMain.handle('conn:test', async (event, conn) => {
    let tunnel = null;
    try {
      const resolved = await resolveConnection(conn);
      tunnel = resolved.tunnel;
      const client = new MongoClient(resolved.uri, { serverSelectionTimeoutMS: 6000 });
      try {
        await client.connect();
        await client.db('admin').command({ ping: 1 });
        return { ok: true };
      } finally {
        await client.close().catch(() => {});
      }
    } catch (err) {
      return { ok: false, error: err.message };
    } finally {
      closeTunnel(tunnel);
    }
  });

  ipcMain.handle('conn:open', async (event, conn) => {
    if (activeClients.has(conn.id)) {
      return { ok: true, alreadyOpen: true };
    }
    try {
      const { uri, tunnel } = await resolveConnection(conn);
      const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
      await client.connect();
      activeClients.set(conn.id, client);
      if (tunnel) activeTunnels.set(conn.id, tunnel);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('conn:close', async (event, id) => {
    await cleanupClient(id);
    return true;
  });

  ipcMain.handle('conn:listDatabases', async (event, id) => {
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

  ipcMain.handle('conn:listCollections', async (event, { connId, dbName }) => {
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

  ipcMain.handle('conn:pickPrivateKey', async () => {
    const { dialog } = require('electron');
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: 'Select SSH Private Key'
    });
    if (canceled || !filePaths.length) return null;
    return filePaths[0];
  });
}

function getClient(id) {
  const client = activeClients.get(id);
  if (!client) throw new Error('Connection is not open. Please connect first.');
  return client;
}

module.exports = { registerConnectionHandlers, getClient, buildUri };