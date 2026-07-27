const { EJSON } = require('bson');
const fs = require('fs');
const { dialog } = require('electron');
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

  // Exports an entire collection (not just the currently-loaded page) straight from the sidebar context menu.
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

  // Imports a file straight into a target collection from the sidebar context menu (collection may not exist yet).
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

  // Copies all documents of a collection from one open connection to a (possibly different) database/collection on another open connection.
  ipcMain.handle('data:copyCollection', async (event, { sourceConnId, sourceDb, sourceCollection, targetConnId, targetDb, targetCollection }) => {
    const sourceClient = getClient(sourceConnId);
    const targetClient = getClient(targetConnId);
    const docs = await sourceClient.db(sourceDb).collection(sourceCollection).find({}).toArray();
    if (docs.length === 0) return { ok: true, copiedCount: 0 };
    const result = await targetClient.db(targetDb).collection(targetCollection).insertMany(docs, { ordered: false });
    return { ok: true, copiedCount: result.insertedCount };
  });

  // Exports: open save dialog, write results as JSON or CSV
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

  // Import: open file dialog, parse JSON or CSV, insert into collection
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
