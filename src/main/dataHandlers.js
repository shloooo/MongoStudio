const { EJSON } = require('bson');
const fs = require('fs');
const path = require('path');
const {dialog, BrowserWindow} = require('electron');
const { getClient } = require('./connectionManager');

function parseEjson(input) {
  if (input === undefined || input === null || input === '') return {};
  if (typeof input === 'object') return input;
  return EJSON.parse(input);
}

function registerDataHandlers(ipcMain) {
  ipcMain.handle('data:find', async (event, { connId, dbName, collection, filter, sort, projection, limit, skip }) => {
    const client = getClient(connId);
    const coll = client.db(dbName).collection(collection);
    const q = parseEjson(filter);
    const s = parseEjson(sort);
    const p = parseEjson(projection);
    let cursor = coll.find(q, { projection: p });
    if (Object.keys(s).length) cursor = cursor.sort(s);
    if (skip) cursor = cursor.skip(Number(skip));
    cursor = cursor.limit(Math.min(Number(limit) || 100, 5000));
    const docs = await cursor.toArray();
    const count = await coll.countDocuments(q);
    return { docs: EJSON.serialize(docs), totalCount: count };
  });

  ipcMain.handle('data:aggregate', async (event, { connId, dbName, collection, pipeline }) => {
    const client = getClient(connId);
    const coll = client.db(dbName).collection(collection);
    const p = parseEjson(pipeline);
    if (!Array.isArray(p)) throw new Error('Pipeline muss ein Array sein');
    const docs = await coll.aggregate(p, { allowDiskUse: true }).toArray();
    return EJSON.serialize(docs);
  });

  ipcMain.handle('data:insertOne', async (event, { connId, dbName, collection, doc }) => {
    const client = getClient(connId);
    const parsed = parseEjson(doc);
    const result = await client.db(dbName).collection(collection).insertOne(parsed);
    return { insertedId: EJSON.serialize(result.insertedId) };
  });

  ipcMain.handle('data:updateOne', async (event, { connId, dbName, collection, filter, update, upsert }) => {
    const client = getClient(connId);
    const q = parseEjson(filter);
    const u = parseEjson(update);
    const result = await client.db(dbName).collection(collection).updateOne(q, u, { upsert: !!upsert });
    return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount, upsertedId: EJSON.serialize(result.upsertedId) };
  });

  ipcMain.handle('data:updateMany', async (event, { connId, dbName, collection, filter, update, upsert }) => {
    const client = getClient(connId);
    const q = parseEjson(filter);
    const u = parseEjson(update);
    const result = await client.db(dbName).collection(collection).updateMany(q, u, { upsert: !!upsert });
    return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount };
  });

  ipcMain.handle('data:deleteOne', async (event, { connId, dbName, collection, filter }) => {
    const client = getClient(connId);
    const q = parseEjson(filter);
    const result = await client.db(dbName).collection(collection).deleteOne(q);
    return { deletedCount: result.deletedCount };
  });

  ipcMain.handle('data:deleteMany', async (event, { connId, dbName, collection, filter }) => {
    const client = getClient(connId);
    const q = parseEjson(filter);
    const result = await client.db(dbName).collection(collection).deleteMany(q);
    return { deletedCount: result.deletedCount };
  });

  ipcMain.handle('data:createCollection', async (event, { connId, dbName, collection }) => {
    const client = getClient(connId);
    await client.db(dbName).createCollection(collection);
    return true;
  });

  ipcMain.handle('data:dropCollection', async (event, { connId, dbName, collection }) => {
    const client = getClient(connId);
    await client.db(dbName).collection(collection).drop();
    return true;
  });

  ipcMain.handle('data:indexes', async (event, { connId, dbName, collection }) => {
    const client = getClient(connId);
    const idx = await client.db(dbName).collection(collection).indexes();
    return idx;
  });

  ipcMain.handle('data:createIndex', async (event, { connId, dbName, collection, spec, options }) => {
    const client = getClient(connId);
    const keys = parseEjson(spec);
    const opts = parseEjson(options);
    const name = await client.db(dbName).collection(collection).createIndex(keys, opts);
    return name;
  });

  ipcMain.handle('data:listUsers', async (event, { connId, dbName }) => {
    const client = getClient(connId);
    const result = await client.db(dbName).command({ usersInfo: 1 });
    return result.users || [];
  });

  ipcMain.handle('data:createUser', async (event, { connId, dbName, user, pwd, roles }) => {
    const client = getClient(connId);
    await client.db(dbName).command({ createUser: user, pwd, roles: roles || [] });
    return true;
  });

  ipcMain.handle('data:updateUser', async (event, { connId, dbName, user, pwd, roles }) => {
    const client = getClient(connId);
    const cmd = { updateUser: user };
    if (pwd) cmd.pwd = pwd;
    if (roles) cmd.roles = roles;
    await client.db(dbName).command(cmd);
    return true;
  });

  ipcMain.handle('data:dropUser', async (event, { connId, dbName, user }) => {
    const client = getClient(connId);
    await client.db(dbName).command({ dropUser: user });
    return true;
  });

  ipcMain.handle('data:dropDatabase', async (event, { connId, dbName }) => {
    const client = getClient(connId);
    await client.db(dbName).dropDatabase();
    return true;
  });

  ipcMain.handle('data:exportDatabase', async (event, { connId, dbName, format }) => {
    const client = getClient(connId);
    const db = client.db(dbName);
    const collections = await db.listCollections().toArray();
    const win = require('electron').BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: `Export ${dbName} - choose destination folder`,
      properties: ['openDirectory', 'createDirectory']
    });
    if (canceled || !filePaths.length) return { ok: false };
    const targetDir = path.join(filePaths[0], dbName);
    fs.mkdirSync(targetDir, { recursive: true });
    let totalCount = 0;
    const perCollection = [];
    for (const c of collections) {
      const docs = EJSON.serialize(await db.collection(c.name).find({}).toArray());
      const ext = format === 'csv' ? 'csv' : 'json';
      const filePath = path.join(targetDir, `${c.name}.${ext}`);
      if (format === 'csv') {
        const rows = docs.map((d) => flattenObject(d));
        const headers = Array.from(rows.reduce((set, r) => {
          Object.keys(r).forEach((k) => set.add(k));
          return set;
        }, new Set()));
        const lines = [headers.join(',')];
        for (const row of rows) lines.push(headers.map((h) => csvEscape(row[h])).join(','));
        fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
      } else {
        fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf-8');
      }
      totalCount += docs.length;
      perCollection.push({ collection: c.name, count: docs.length });
    }
    return { ok: true, folderPath: targetDir, collectionCount: collections.length, count: totalCount, perCollection };
  });

  ipcMain.handle('data:importDatabase', async (event, { connId, dbName }) => {
    const win = require('electron').BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: `Import into ${dbName} - choose folder or files`,
      properties: ['openFile', 'openDirectory', 'multiSelections'],
      filters: [
        { name: 'JSON/CSV', extensions: ['json', 'csv'] },
        { name: 'All files', extensions: ['*'] }
      ]
    });
    if (canceled || !filePaths.length) return { ok: false };

    const files = [];
    for (const p of filePaths) {
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        for (const entry of fs.readdirSync(p)) {
          if (entry.endsWith('.json') || entry.endsWith('.csv')) files.push(path.join(p, entry));
        }
      } else {
        files.push(p);
      }
    }

    const client = getClient(connId);
    const db = client.db(dbName);
    const results = [];
    for (const filePath of files) {
      const collectionName = path.basename(filePath, path.extname(filePath));
      const raw = fs.readFileSync(filePath, 'utf-8');
      let docs;
      if (filePath.endsWith('.csv')) {
        docs = parseCsv(raw);
      } else {
        const trimmed = raw.trim();
        if (trimmed.startsWith('[')) {
          docs = JSON.parse(trimmed);
        } else {
          docs = trimmed.split(/\r?\n/).filter((l) => l.trim().length).map((l) => JSON.parse(l));
        }
      }
      if (!docs.length) {
        results.push({ collection: collectionName, insertedCount: 0 });
        continue;
      }
      const result = await db.collection(collectionName).insertMany(
          docs.map((d) => EJSON.deserialize(d)),
          { ordered: false }
      );
      results.push({ collection: collectionName, insertedCount: result.insertedCount });
    }
    const insertedCount = results.reduce((sum, r) => sum + r.insertedCount, 0);
    return { ok: true, insertedCount, collectionCount: results.length, perCollection: results };
  });

  ipcMain.handle('data:copyDatabase', async (event, {sourceConnId, sourceDb, targetConnId, targetDb, requestId}) => {
    const sourceClient = getClient(sourceConnId);
    const targetClient = getClient(targetConnId);
    const send = makeProgressSender(event, requestId);

    const collections = await sourceClient.db(sourceDb).listCollections().toArray();
    send({phase: 'start', collections: collections.map((c) => c.name)});

    let copiedCount = 0;
    const perCollection = [];
    for (const c of collections) {
      const sourceColl = sourceClient.db(sourceDb).collection(c.name);
      const targetColl = targetClient.db(targetDb).collection(c.name);
      const totalInCollection = await sourceColl.countDocuments();
      send({phase: 'collection-start', collection: c.name, totalInCollection, copiedCount});

      const copiedInCollection = await copyCollectionDocs(sourceColl, targetColl, (copiedInCollection) => {
        send({
          phase: 'progress',
          collection: c.name,
          copiedInCollection,
          totalInCollection,
          copiedCount: copiedCount + copiedInCollection
        });
      });

      copiedCount += copiedInCollection;
      perCollection.push({collection: c.name, count: copiedInCollection});
      send({phase: 'collection-done', collection: c.name, copiedInCollection, totalInCollection, copiedCount});
    }
    send({phase: 'done', copiedCount, collectionCount: collections.length});
    return { ok: true, copiedCount, collectionCount: collections.length, perCollection };
  });

  ipcMain.handle('data:exportCollection', async (event, { connId, dbName, collection, format }) => {
    const client = getClient(connId);
    const docs = EJSON.serialize(await client.db(dbName).collection(collection).find({}).toArray());
    const win = require('electron').BrowserWindow.getFocusedWindow();
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: `${collection}.${format === 'csv' ? 'csv' : 'json'}`,
      filters: format === 'csv'
          ? [{ name: 'CSV', extensions: ['csv'] }]
          : [{ name: 'JSON', extensions: ['json'] }]
    });
    if (canceled || !filePath) return { ok: false };
    if (format === 'csv') {
      const rows = docs.map((d) => flattenObject(d));
      const headers = Array.from(rows.reduce((set, r) => {
        Object.keys(r).forEach((k) => set.add(k));
        return set;
      }, new Set()));
      const lines = [headers.join(',')];
      for (const row of rows) lines.push(headers.map((h) => csvEscape(row[h])).join(','));
      fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
    } else {
      fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf-8');
    }
    return { ok: true, filePath, count: docs.length };
  });

  ipcMain.handle('data:importIntoCollection', async (event, { connId, dbName, collection }) => {
    const win = require('electron').BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [
        { name: 'JSON/CSV', extensions: ['json', 'csv'] },
        { name: 'All files', extensions: ['*'] }
      ]
    });
    if (canceled || !filePaths.length) return { ok: false };
    const filePath = filePaths[0];
    const raw = fs.readFileSync(filePath, 'utf-8');
    let docs;
    if (filePath.endsWith('.csv')) {
      docs = parseCsv(raw);
    } else {
      const parsed = JSON.parse(raw);
      docs = Array.isArray(parsed) ? parsed : [parsed];
    }
    if (docs.length === 0) return { ok: true, insertedCount: 0 };
    const client = getClient(connId);
    const result = await client.db(dbName).collection(collection).insertMany(
        docs.map((d) => EJSON.deserialize(d)),
        { ordered: false }
    );
    return { ok: true, insertedCount: result.insertedCount };
  });

  ipcMain.handle('data:copyCollection', async (event, {
    sourceConnId,
    sourceDb,
    sourceCollection,
    targetConnId,
    targetDb,
    targetCollection,
    requestId
  }) => {
    const sourceClient = getClient(sourceConnId);
    const targetClient = getClient(targetConnId);
    const send = makeProgressSender(event, requestId);

    const sourceColl = sourceClient.db(sourceDb).collection(sourceCollection);
    const targetColl = targetClient.db(targetDb).collection(targetCollection);
    const totalInCollection = await sourceColl.countDocuments();
    send({phase: 'start', collection: sourceCollection, totalInCollection});

    const copiedCount = await copyCollectionDocs(sourceColl, targetColl, (copiedCount) => {
      send({phase: 'progress', collection: sourceCollection, copiedCount, totalInCollection});
    });

    send({phase: 'done', collection: sourceCollection, copiedCount, totalInCollection});
    return {ok: true, copiedCount};
  });

  ipcMain.handle('data:exportResults', async (event, { docs, format, suggestedName }) => {
    const win = require('electron').BrowserWindow.getFocusedWindow();
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: suggestedName || `export.${format === 'csv' ? 'csv' : 'json'}`,
      filters: format === 'csv'
          ? [{ name: 'CSV', extensions: ['csv'] }]
          : [{ name: 'JSON', extensions: ['json'] }]
    });
    if (canceled || !filePath) return { ok: false };

    if (format === 'csv') {
      const rows = docs.map((d) => flattenObject(d));
      const headers = Array.from(rows.reduce((set, r) => {
        Object.keys(r).forEach((k) => set.add(k));
        return set;
      }, new Set()));
      const lines = [headers.join(',')];
      for (const row of rows) {
        lines.push(headers.map((h) => csvEscape(row[h])).join(','));
      }
      fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
    } else {
      fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf-8');
    }
    return { ok: true, filePath };
  });

  ipcMain.handle('data:importFile', async (event, { connId, dbName, collection }) => {
    const win = require('electron').BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [
        { name: 'JSON/CSV', extensions: ['json', 'csv'] },
        { name: 'Alle Dateien', extensions: ['*'] }
      ]
    });
    if (canceled || !filePaths.length) return { ok: false };
    const filePath = filePaths[0];
    const raw = fs.readFileSync(filePath, 'utf-8');
    let docs;
    if (filePath.endsWith('.csv')) {
      docs = parseCsv(raw);
    } else {
      const parsed = JSON.parse(raw);
      docs = Array.isArray(parsed) ? parsed : [parsed];
    }
    const client = getClient(connId);
    const coll = client.db(dbName).collection(collection);
    const result = await coll.insertMany(docs, { ordered: false });
    return { ok: true, insertedCount: result.insertedCount };
  });
}

const COPY_BATCH_SIZE = 500;

function makeProgressSender(event, requestId) {
  const win = BrowserWindow.fromWebContents(event.sender);
  return (payload) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('data:copyProgress', {requestId, ...payload});
    }
  };
}

async function copyCollectionDocs(sourceColl, targetColl, onBatch) {
  const cursor = sourceColl.find({});
  let batch = [];
  let copiedCount = 0;
  while (await cursor.hasNext()) {
    batch.push(await cursor.next());
    if (batch.length >= COPY_BATCH_SIZE) {
      const result = await targetColl.insertMany(batch, {ordered: false});
      copiedCount += result.insertedCount;
      batch = [];
      if (onBatch) onBatch(copiedCount);
    }
  }
  if (batch.length) {
    const result = await targetColl.insertMany(batch, {ordered: false});
    copiedCount += result.insertedCount;
    if (onBatch) onBatch(copiedCount);
  }
  return copiedCount;
}

function flattenObject(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && !v.$oid && !v.$date) {
      Object.assign(out, flattenObject(v, key));
    } else {
      out[key] = typeof v === 'object' ? JSON.stringify(v) : v;
    }
  }
  return out;
}

function csvEscape(val) {
  if (val === undefined || val === null) return '';
  const str = String(val);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function parseCsv(raw) {
  const lines = raw.split(/\r?\n/).filter((l) => l.length);
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i]; });
    return obj;
  });
}

function splitCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { result.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  result.push(cur);
  return result;
}

module.exports = { registerDataHandlers };