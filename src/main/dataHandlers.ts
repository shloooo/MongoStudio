import {EJSON} from 'bson';
import fs from 'node:fs';
import path from 'node:path';
import {dialog, BrowserWindow, type IpcMain, type IpcMainInvokeEvent} from 'electron';
import {getClient} from './connectionManager.js';
import type {Collection} from 'mongodb';

function parseEjson(input: any): any {
  if (input === undefined || input === null || input === '') return {};
  if (typeof input === 'object') return input;
  return EJSON.parse(input);
}

export function registerDataHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('data:find', async (event, {connId, dbName, collection, filter, sort, projection, limit, skip}) => {
    const client = getClient(connId);
    const coll = client.db(dbName).collection(collection);
    const q = parseEjson(filter);
    const s = parseEjson(sort);
    const p = parseEjson(projection);
    let cursor = coll.find(q, {projection: p});
    if (Object.keys(s).length) cursor = cursor.sort(s);
    if (skip) cursor = cursor.skip(Number(skip));
    cursor = cursor.limit(Math.min(Number(limit) || 100, 5000));
    const docs = await cursor.toArray();
    const count = await coll.countDocuments(q);
    return {docs: EJSON.serialize(docs), totalCount: count};
  });

  ipcMain.handle('data:aggregate', async (event, {connId, dbName, collection, pipeline}) => {
    const client = getClient(connId);
    const coll = client.db(dbName).collection(collection);
    const p = parseEjson(pipeline);
    if (!Array.isArray(p)) throw new Error('Pipeline muss ein Array sein');
    const docs = await coll.aggregate(p, {allowDiskUse: true}).toArray();
    return EJSON.serialize(docs);
  });

  ipcMain.handle('data:insertOne', async (event, {connId, dbName, collection, doc}) => {
    const client = getClient(connId);
    const parsed = parseEjson(doc);
    const result = await client.db(dbName).collection(collection).insertOne(parsed);
    return {insertedId: EJSON.serialize(result.insertedId)};
  });

  ipcMain.handle('data:updateOne', async (event, {connId, dbName, collection, filter, update, upsert}) => {
    const client = getClient(connId);
    const q = parseEjson(filter);
    const u = parseEjson(update);
    const result = await client.db(dbName).collection(collection).updateOne(q, u, {upsert: !!upsert});
    return {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      upsertedId: EJSON.serialize(result.upsertedId)
    };
  });

  ipcMain.handle('data:updateMany', async (event, {connId, dbName, collection, filter, update, upsert}) => {
    const client = getClient(connId);
    const q = parseEjson(filter);
    const u = parseEjson(update);
    const result = await client.db(dbName).collection(collection).updateMany(q, u, {upsert: !!upsert});
    return {matchedCount: result.matchedCount, modifiedCount: result.modifiedCount};
  });

  ipcMain.handle('data:deleteOne', async (event, {connId, dbName, collection, filter}) => {
    const client = getClient(connId);
    const q = parseEjson(filter);
    const result = await client.db(dbName).collection(collection).deleteOne(q);
    return {deletedCount: result.deletedCount};
  });

  ipcMain.handle('data:deleteMany', async (event, {connId, dbName, collection, filter}) => {
    const client = getClient(connId);
    const q = parseEjson(filter);
    const result = await client.db(dbName).collection(collection).deleteMany(q);
    return {deletedCount: result.deletedCount};
  });

  ipcMain.handle('data:createCollection', async (event, {connId, dbName, collection}) => {
    const client = getClient(connId);
    await client.db(dbName).createCollection(collection);
    return true;
  });

  ipcMain.handle('data:dropCollection', async (event, {connId, dbName, collection}) => {
    const client = getClient(connId);
    await client.db(dbName).collection(collection).drop();
    return true;
  });

  ipcMain.handle('data:indexes', async (event, {connId, dbName, collection}) => {
    const client = getClient(connId);
    return await client.db(dbName).collection(collection).indexes();
  });

  ipcMain.handle('data:createIndex', async (event, {connId, dbName, collection, spec, options}) => {
    const client = getClient(connId);
    const keys = parseEjson(spec);
    const opts = parseEjson(options);
    return await client.db(dbName).collection(collection).createIndex(keys, opts);
  });

  ipcMain.handle('data:listUsers', async (event, {connId, dbName}) => {
    const client = getClient(connId);
    const result = await client.db(dbName).command({usersInfo: 1});
    return dedupeUsers(result.users || []);
  });

  ipcMain.handle('data:listAllUsers', async (event, {connId}) => {
    const client = getClient(connId);
    return listAllUsers(client);
  });

  ipcMain.handle('data:listRoles', async (event, {connId, dbName}) => {
    const client = getClient(connId);
    const result = await client.db(dbName).command({rolesInfo: 1, showBuiltinRoles: true});
    return (result.roles || [])
        .map((r: any) => ({role: r.role, db: r.db, isBuiltin: !!r.isBuiltin}))
        .sort((a: any, b: any) => a.role.localeCompare(b.role));
  });

  ipcMain.handle('data:userPrivileges', async (event, {connId, dbName, user}) => {
    const client = getClient(connId);
    return loadUserDetail(client, dbName, user);
  });

  // Lists every user in the cluster that holds at least one privilege on dbName.collection,
  // together with the actions that privilege grants there.
  ipcMain.handle('data:collectionUsers', async (event, {connId, dbName, collection}) => {
    const client = getClient(connId);
    const all = await listAllUsers(client);
    const out = [];
    for (const u of all) {
      let detail;
      try {
        detail = await loadUserDetail(client, u.db, u.user);
      } catch {
        continue; // the user's auth db may not be readable with the current credentials
      }
      const matched = detail.privileges.filter((p: any) => resourceCoversCollection(p.resource, dbName, collection));
      if (!matched.length) continue;
      out.push({
        user: detail.user,
        db: detail.db,
        roles: detail.roles,
        mechanisms: detail.mechanisms,
        actions: Array.from(new Set(matched.flatMap((p: any) => p.actions || []))).sort(),
        resources: matched.map((p: any) => p.resource)
      });
    }
    return out;
  });

  ipcMain.handle('data:createUser', async (event, {connId, dbName, user, pwd, roles}) => {
    const client = getClient(connId);
    await client.db(dbName).command({createUser: user, pwd, roles: roles || []});
    return true;
  });

  ipcMain.handle('data:updateUser', async (event, {connId, dbName, user, pwd, roles}) => {
    const client = getClient(connId);
    const cmd: Record<string, any> = {updateUser: user};
    if (pwd) cmd.pwd = pwd;
    if (roles) cmd.roles = roles;
    await client.db(dbName).command(cmd);
    return true;
  });

  ipcMain.handle('data:dropUser', async (event, {connId, dbName, user}) => {
    const client = getClient(connId);
    await client.db(dbName).command({dropUser: user});
    return true;
  });

  ipcMain.handle('data:dropDatabase', async (event, {connId, dbName}) => {
    const client = getClient(connId);
    await client.db(dbName).dropDatabase();
    return true;
  });

  ipcMain.handle('data:exportDatabase', async (event, {connId, dbName, format}) => {
    const client = getClient(connId);
    const db = client.db(dbName);
    const collections = await db.listCollections().toArray();
    const win = BrowserWindow.getFocusedWindow();
    const {canceled, filePaths} = await dialog.showOpenDialog(win!, {
      title: `Export ${dbName} - choose destination folder`,
      properties: ['openDirectory', 'createDirectory']
    });
    if (canceled || !filePaths.length) return {ok: false};
    const targetDir = path.join(filePaths[0], dbName);
    fs.mkdirSync(targetDir, {recursive: true});
    let totalCount = 0;
    const perCollection = [];
    for (const c of collections) {
      const docs = EJSON.serialize(await db.collection(c.name).find({}).toArray());
      const ext = format === 'csv' ? 'csv' : 'json';
      const filePath = path.join(targetDir, `${c.name}.${ext}`);
      if (format === 'csv') {
        const rows = docs.map((d: any) => flattenObject(d));
        const headers: string[] = Array.from(rows.reduce((set: Set<string>, r: any) => {
          Object.keys(r).forEach((k) => set.add(k));
          return set;
        }, new Set<string>()));
        const lines = [headers.join(',')];
        for (const row of rows) lines.push(headers.map((h) => csvEscape((row as any)[h])).join(','));
        fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
      } else {
        fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf-8');
      }
      totalCount += docs.length;
      perCollection.push({collection: c.name, count: docs.length});
    }
    return {ok: true, folderPath: targetDir, collectionCount: collections.length, count: totalCount, perCollection};
  });

  ipcMain.handle('data:importDatabase', async (event, {connId, dbName}) => {
    const win = BrowserWindow.getFocusedWindow();
    const {canceled, filePaths} = await dialog.showOpenDialog(win!, {
      title: `Import into ${dbName} - choose folder or files`,
      properties: ['openFile', 'openDirectory', 'multiSelections'],
      filters: [
        {name: 'JSON/CSV', extensions: ['json', 'csv']},
        {name: 'All files', extensions: ['*']}
      ]
    });
    if (canceled || !filePaths.length) return {ok: false};

    const files: string[] = [];
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
      let docs: any[];
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
        results.push({collection: collectionName, insertedCount: 0});
        continue;
      }
      const result = await db.collection(collectionName).insertMany(
          docs.map((d) => EJSON.deserialize(d)),
          {ordered: false}
      );
      results.push({collection: collectionName, insertedCount: result.insertedCount});
    }
    const insertedCount = results.reduce((sum, r) => sum + r.insertedCount, 0);
    return {ok: true, insertedCount, collectionCount: results.length, perCollection: results};
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
    return {ok: true, copiedCount, collectionCount: collections.length, perCollection};
  });

  ipcMain.handle('data:exportCollection', async (event, {connId, dbName, collection, format}) => {
    const client = getClient(connId);
    const docs = EJSON.serialize(await client.db(dbName).collection(collection).find({}).toArray());
    const win = BrowserWindow.getFocusedWindow();
    const {canceled, filePath} = await dialog.showSaveDialog(win!, {
      defaultPath: `${collection}.${format === 'csv' ? 'csv' : 'json'}`,
      filters: format === 'csv'
          ? [{name: 'CSV', extensions: ['csv']}]
          : [{name: 'JSON', extensions: ['json']}]
    });
    if (canceled || !filePath) return {ok: false};
    if (format === 'csv') {
      const rows = docs.map((d: any) => flattenObject(d));
      const headers: string[] = Array.from(rows.reduce((set: Set<string>, r: any) => {
        Object.keys(r).forEach((k) => set.add(k));
        return set;
      }, new Set<string>()));
      const lines = [headers.join(',')];
      for (const row of rows) lines.push(headers.map((h) => csvEscape((row as any)[h])).join(','));
      fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
    } else {
      fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf-8');
    }
    return {ok: true, filePath, count: docs.length};
  });

  ipcMain.handle('data:importIntoCollection', async (event, {connId, dbName, collection}) => {
    const win = BrowserWindow.getFocusedWindow();
    const {canceled, filePaths} = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [
        {name: 'JSON/CSV', extensions: ['json', 'csv']},
        {name: 'All files', extensions: ['*']}
      ]
    });
    if (canceled || !filePaths.length) return {ok: false};
    const filePath = filePaths[0];
    const raw = fs.readFileSync(filePath, 'utf-8');
    let docs: any[];
    if (filePath.endsWith('.csv')) {
      docs = parseCsv(raw);
    } else {
      const parsed = JSON.parse(raw);
      docs = Array.isArray(parsed) ? parsed : [parsed];
    }
    if (docs.length === 0) return {ok: true, insertedCount: 0};
    const client = getClient(connId);
    const result = await client.db(dbName).collection(collection).insertMany(
        docs.map((d) => EJSON.deserialize(d)),
        {ordered: false}
    );
    return {ok: true, insertedCount: result.insertedCount};
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

  ipcMain.handle('data:exportResults', async (event, {docs, format, suggestedName}) => {
    const win = BrowserWindow.getFocusedWindow();
    const {canceled, filePath} = await dialog.showSaveDialog(win!, {
      defaultPath: suggestedName || `export.${format === 'csv' ? 'csv' : 'json'}`,
      filters: format === 'csv'
          ? [{name: 'CSV', extensions: ['csv']}]
          : [{name: 'JSON', extensions: ['json']}]
    });
    if (canceled || !filePath) return {ok: false};

    if (format === 'csv') {
      const rows = docs.map((d: any) => flattenObject(d));
      const headers: string[] = Array.from(rows.reduce((set: Set<string>, r: any) => {
        Object.keys(r).forEach((k) => set.add(k));
        return set;
      }, new Set<string>()));
      const lines = [headers.join(',')];
      for (const row of rows) {
        lines.push(headers.map((h) => csvEscape((row as any)[h])).join(','));
      }
      fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
    } else {
      fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf-8');
    }
    return {ok: true, filePath};
  });

  ipcMain.handle('data:importFile', async (event, {connId, dbName, collection}) => {
    const win = BrowserWindow.getFocusedWindow();
    const {canceled, filePaths} = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [
        {name: 'JSON/CSV', extensions: ['json', 'csv']},
        {name: 'Alle Dateien', extensions: ['*']}
      ]
    });
    if (canceled || !filePaths.length) return {ok: false};
    const filePath = filePaths[0];
    const raw = fs.readFileSync(filePath, 'utf-8');
    let docs: any[];
    if (filePath.endsWith('.csv')) {
      docs = parseCsv(raw);
    } else {
      const parsed = JSON.parse(raw);
      docs = Array.isArray(parsed) ? parsed : [parsed];
    }
    const client = getClient(connId);
    const coll = client.db(dbName).collection(collection);
    const result = await coll.insertMany(docs, {ordered: false});
    return {ok: true, insertedCount: result.insertedCount};
  });
}

// `usersInfo: { forAllDBs: true }` needs MongoDB 4.0+ and cluster-wide viewUser rights;
// where it is unavailable we sweep every database instead.
async function listAllUsers(client: any) {
  const admin = client.db('admin');
  try {
    const result = await admin.command({usersInfo: {forAllDBs: true}});
    return dedupeUsers(result.users || []);
  } catch {
    const {databases} = await admin.admin().listDatabases();
    const users = [];
    for (const d of databases) {
      try {
        const result = await client.db(d.name).command({usersInfo: 1});
        users.push(...(result.users || []));
      } catch {
        // not authorized to read users on this database
      }
    }
    return dedupeUsers(users);
  }
}

function dedupeUsers(users: any[]) {
  const byKey = new Map<string, any>();
  for (const u of users) byKey.set(`${u.db}.${u.user}`, u);
  return Array.from(byKey.values()).sort((a, b) =>
      a.db === b.db ? a.user.localeCompare(b.user) : a.db.localeCompare(b.db)
  );
}

async function loadUserDetail(client: any, dbName: string, user: string) {
  const result = await client.db(dbName).command({
    usersInfo: {user, db: dbName},
    showPrivileges: true
  });
  const found = (result.users || [])[0];
  if (!found) throw new Error(`User "${user}" does not exist on "${dbName}".`);
  return {
    user: found.user,
    db: found.db,
    roles: found.roles || [],
    mechanisms: found.mechanisms || [],
    customData: found.customData,
    privileges: found.inheritedPrivileges || found.privileges || []
  };
}

// A privilege resource covers db.collection when both parts match; an empty string is a wildcard.
function resourceCoversCollection(resource: any, dbName: string, collection: string): boolean {
  if (!resource) return false;
  if (resource.anyResource) return true;
  if (resource.cluster) return false; // cluster actions are not collection-scoped
  if (typeof resource.db !== 'string' || typeof resource.collection !== 'string') return false;
  return (resource.db === '' || resource.db === dbName)
      && (resource.collection === '' || resource.collection === collection);
}

const COPY_BATCH_SIZE = 500;

function makeProgressSender(event: IpcMainInvokeEvent, requestId: string) {
  const win = BrowserWindow.fromWebContents(event.sender);
  return (payload: Record<string, any>) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('data:copyProgress', {requestId, ...payload});
    }
  };
}

async function copyCollectionDocs(sourceColl: Collection, targetColl: Collection, onBatch?: (copiedCount: number) => void): Promise<number> {
  const cursor = sourceColl.find({});
  let batch: any[] = [];
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

function flattenObject(obj: Record<string, any>, prefix = ''): Record<string, any> {
  const out: Record<string, any> = {};
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

function csvEscape(val: any): string {
  if (val === undefined || val === null) return '';
  const str = String(val);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function parseCsv(raw: string): Record<string, string>[] {
  const lines = raw.split(/\r?\n/).filter((l) => l.length);
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = values[i];
    });
    return obj;
  });
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') {
        result.push(cur);
        cur = '';
      } else cur += ch;
    }
  }
  result.push(cur);
  return result;
}