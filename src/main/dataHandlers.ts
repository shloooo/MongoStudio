import {EJSON} from 'bson';
import fs from 'node:fs';
import path from 'node:path';
import {BrowserWindow, dialog, type IpcMain, type IpcMainInvokeEvent} from 'electron';
import {getClient} from './connectionManager.js';
import type {Collection} from 'mongodb';
import {
  addHistoryEntry,
  clearHistory,
  getHistoryEntry,
  listHistory,
  markUndone,
  serializeDocs
} from './historyStore.js';

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

  ipcMain.handle('data:insertOne', async (event, {connId, dbName, collection, doc, connLabel, skipHistory}) => {
    const client = getClient(connId);
    const parsed = parseEjson(doc);
    const result = await client.db(dbName).collection(collection).insertOne(parsed);
    const inserted = {...parsed, _id: result.insertedId};
    if (!skipHistory) {
      addHistoryEntry({
        connId, connLabel, dbName, collection,
        opType: 'insertOne',
        summary: `Insert 1 document`,
        before: [],
        after: serializeDocs([inserted])
      });
    }
    return {insertedId: EJSON.serialize(result.insertedId)};
  });

  ipcMain.handle('data:updateOne', async (event, {connId, dbName, collection, filter, update, upsert, connLabel, skipHistory}) => {
    const client = getClient(connId);
    const coll = client.db(dbName).collection(collection);
    const q = parseEjson(filter);
    const u = parseEjson(update);
    const before = skipHistory ? [] : await coll.find(q).toArray();
    const result = await coll.updateOne(q, u, {upsert: !!upsert});
    if (!skipHistory && before.length) {
      const ids = before.map((d: any) => d._id);
      const after = await coll.find({_id: {$in: ids}}).toArray();
      addHistoryEntry({
        connId, connLabel, dbName, collection,
        opType: 'updateOne',
        summary: `Update 1 document`,
        before: serializeDocs(before),
        after: serializeDocs(after)
      });
    }
    return {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      upsertedId: EJSON.serialize(result.upsertedId)
    };
  });

  ipcMain.handle('data:updateMany', async (event, {connId, dbName, collection, filter, update, upsert, connLabel, skipHistory}) => {
    const client = getClient(connId);
    const coll = client.db(dbName).collection(collection);
    const q = parseEjson(filter);
    const u = parseEjson(update);
    const before = skipHistory ? [] : await coll.find(q).limit(2000).toArray();
    const result = await coll.updateMany(q, u, {upsert: !!upsert});
    if (!skipHistory && before.length) {
      const ids = before.map((d: any) => d._id);
      const after = await coll.find({_id: {$in: ids}}).toArray();
      addHistoryEntry({
        connId, connLabel, dbName, collection,
        opType: 'updateMany',
        summary: `Update ${before.length} document(s)`,
        before: serializeDocs(before),
        after: serializeDocs(after)
      });
    }
    return {matchedCount: result.matchedCount, modifiedCount: result.modifiedCount};
  });

  ipcMain.handle('data:deleteOne', async (event, {connId, dbName, collection, filter, connLabel, skipHistory}) => {
    const client = getClient(connId);
    const coll = client.db(dbName).collection(collection);
    const q = parseEjson(filter);
    const before = skipHistory ? [] : await coll.find(q).limit(1).toArray();
    const result = await coll.deleteOne(q);
    if (!skipHistory && before.length) {
      addHistoryEntry({
        connId, connLabel, dbName, collection,
        opType: 'deleteOne',
        summary: `Delete 1 document`,
        before: serializeDocs(before),
        after: []
      });
    }
    return {deletedCount: result.deletedCount};
  });

  ipcMain.handle('data:deleteMany', async (event, {connId, dbName, collection, filter, connLabel, skipHistory}) => {
    const client = getClient(connId);
    const coll = client.db(dbName).collection(collection);
    const q = parseEjson(filter);
    const before = skipHistory ? [] : await coll.find(q).limit(2000).toArray();
    const result = await coll.deleteMany(q);
    if (!skipHistory && before.length) {
      addHistoryEntry({
        connId, connLabel, dbName, collection,
        opType: 'deleteMany',
        summary: `Delete ${before.length} document(s)`,
        before: serializeDocs(before),
        after: []
      });
    }
    return {deletedCount: result.deletedCount};
  });

  ipcMain.handle('data:shell:exec', async (event, {connId, dbName, collection, root, chain}) => {
    const client = getClient(connId);
    const db = client.db(dbName);
    const args = (root.args || []).map((a: any) => parseEjson(a));
    const chainArgs = (chain || []).map((c: any) => ({
      name: c.name,
      args: (c.args || []).map((a: any) => parseEjson(a))
    }));

    function applyChain(cursor: any) {
      for (const c of chainArgs) {
        if (c.name === 'sort') cursor = cursor.sort(c.args[0] || {});
        else if (c.name === 'limit') cursor = cursor.limit(Number(c.args[0]) || 0);
        else if (c.name === 'skip') cursor = cursor.skip(Number(c.args[0]) || 0);
        else if (c.name === 'projection') cursor = cursor.project(c.args[0] || {});
        else throw new Error(`Unsupported chained method .${c.name}()`);
      }
      return cursor;
    }

    if (!collection) {
      if (root.name === 'getCollectionNames') {
        const cols = await db.listCollections().toArray();
        return {type: 'value', value: cols.map((c) => c.name)};
      }
      if (root.name === 'stats') {
        const stats = await db.stats();
        return {type: 'value', value: EJSON.serialize(stats)};
      }
      throw new Error(`Unsupported db-level method "${root.name}"`);
    }

    const coll = db.collection(collection);

    switch (root.name) {
      case 'find': {
        const cursor = applyChain(coll.find(args[0] || {}, {projection: args[1]}));
        const docs = await cursor.limit(1000).toArray();
        return {type: 'documents', value: EJSON.serialize(docs)};
      }
      case 'findOne': {
        const doc = await coll.findOne(args[0] || {}, {projection: args[1]});
        return {type: 'value', value: doc ? EJSON.serialize(doc) : null};
      }
      case 'insertOne': {
        const result = await coll.insertOne(args[0]);
        return {
          type: 'value',
          value: EJSON.serialize({insertedId: result.insertedId, acknowledged: result.acknowledged})
        };
      }
      case 'insertMany': {
        const result = await coll.insertMany(args[0] || []);
        return {
          type: 'value',
          value: EJSON.serialize({insertedCount: result.insertedCount, insertedIds: result.insertedIds})
        };
      }
      case 'updateOne': {
        const result = await coll.updateOne(args[0] || {}, args[1] || {}, {upsert: !!args[2]?.upsert});
        return {
          type: 'value',
          value: {
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount,
            upsertedId: result.upsertedId ? EJSON.serialize(result.upsertedId) : null
          }
        };
      }
      case 'updateMany': {
        const result = await coll.updateMany(args[0] || {}, args[1] || {}, {upsert: !!args[2]?.upsert});
        return {type: 'value', value: {matchedCount: result.matchedCount, modifiedCount: result.modifiedCount}};
      }
      case 'deleteOne': {
        const result = await coll.deleteOne(args[0] || {});
        return {type: 'value', value: {deletedCount: result.deletedCount}};
      }
      case 'deleteMany': {
        const result = await coll.deleteMany(args[0] || {});
        return {type: 'value', value: {deletedCount: result.deletedCount}};
      }
      case 'countDocuments': {
        const count = await coll.countDocuments(args[0] || {});
        return {type: 'value', value: count};
      }
      case 'aggregate': {
        if (!Array.isArray(args[0])) throw new Error('aggregate() expects a pipeline array');
        const cursor = coll.aggregate(args[0], {allowDiskUse: true});
        const docs = await cursor.limit(1000).toArray();
        return {type: 'documents', value: EJSON.serialize(docs)};
      }
      case 'createIndex': {
        const name = await coll.createIndex(args[0] || {}, args[1] || {});
        return {type: 'value', value: name};
      }
      case 'getIndexes': {
        const idx = await coll.indexes();
        return {type: 'value', value: EJSON.serialize(idx)};
      }
      case 'drop': {
        const result = await coll.drop();
        return {type: 'value', value: result};
      }
      case 'distinct': {
        const values = await coll.distinct(args[0], args[1] || {});
        return {type: 'value', value: EJSON.serialize(values)};
      }
      default:
        throw new Error(`Unsupported method "${root.name}"`);
    }
  });

  ipcMain.handle('data:history:list', async (event, {connId, dbName, collection}) => {
    return listHistory(connId, dbName, collection);
  });

  ipcMain.handle('data:history:clear', async (event, {connId, dbName, collection}) => {
    clearHistory(connId, dbName, collection);
    return true;
  });

  ipcMain.handle('data:history:undo', async (event, {historyId}) => {
    const entry = getHistoryEntry(historyId);
    if (!entry) throw new Error('History entry not found');
    if (entry.undone) throw new Error('This change was already undone');

    const client = getClient(entry.connId);
    const coll = client.db(entry.dbName).collection(entry.collection);
    const before = entry.before.map((d: any) => EJSON.deserialize(d));
    const after = entry.after.map((d: any) => EJSON.deserialize(d));

    if (entry.opType === 'insertOne') {
      for (const doc of after) {
        await coll.deleteOne({_id: doc._id});
      }
    } else if (entry.opType === 'deleteOne' || entry.opType === 'deleteMany') {
      for (const doc of before) {
        await coll.replaceOne({_id: doc._id}, doc, {upsert: true});
      }
    } else if (entry.opType === 'updateOne' || entry.opType === 'updateMany') {
      // Only revert the fields that actually changed, so any unrelated edits
      // made by someone else after this history entry are preserved.
      const afterById = new Map(after.map((d: any) => [String(d._id), d]));
      for (const beforeDoc of before) {
        const afterDoc = afterById.get(String(beforeDoc._id));
        if (!afterDoc) continue;
        const set: Record<string, any> = {};
        const unset: Record<string, ''> = {};
        const fields = new Set([...Object.keys(beforeDoc), ...Object.keys(afterDoc)]);
        for (const field of fields) {
          if (field === '_id') continue;
          const hadBefore = Object.prototype.hasOwnProperty.call(beforeDoc, field);
          const hasAfter = Object.prototype.hasOwnProperty.call(afterDoc, field);
          const beforeVal = hadBefore ? beforeDoc[field] : undefined;
          const afterVal = hasAfter ? afterDoc[field] : undefined;
          if (JSON.stringify(EJSON.serialize({v: beforeVal})) === JSON.stringify(EJSON.serialize({v: afterVal}))) continue;
          if (hadBefore) set[field] = beforeVal;
          else unset[field] = '';
        }
        const updateDoc: Record<string, any> = {};
        if (Object.keys(set).length) updateDoc.$set = set;
        if (Object.keys(unset).length) updateDoc.$unset = unset;
        if (Object.keys(updateDoc).length) {
          await coll.updateOne({_id: beforeDoc._id}, updateDoc);
        }
      }
    }

    markUndone(historyId);
    return {ok: true};
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

  ipcMain.handle('data:renameCollection', async (event, {connId, dbName, collection, newName}) => {
    const client = getClient(connId);
    await client.db(dbName).collection(collection).rename(newName, {dropTarget: false});
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

  ipcMain.handle('data:gridfs:listBuckets', async (event, {connId, dbName}) => {
    const client = getClient(connId);
    const collections = await client.db(dbName).listCollections().toArray();
    const names = new Set(collections.map((c) => c.name));
    const buckets = new Set<string>();
    for (const name of names) {
      if (name.endsWith('.files') && names.has(name.slice(0, -'.files'.length) + '.chunks')) {
        buckets.add(name.slice(0, -'.files'.length));
      }
    }
    return Array.from(buckets).sort();
  });

  ipcMain.handle('data:gridfs:listFiles', async (event, {connId, dbName, bucketName}) => {
    const client = getClient(connId);
    const filesColl = client.db(dbName).collection(`${bucketName}.files`);
    const files = await filesColl.find({}).sort({uploadDate: -1}).limit(1000).toArray();
    return EJSON.serialize(files);
  });

  ipcMain.handle('data:gridfs:upload', async (event, {connId, dbName, bucketName}) => {
    const win = BrowserWindow.getFocusedWindow();
    const {canceled, filePaths} = await dialog.showOpenDialog(win!, {properties: ['openFile']});
    if (canceled || !filePaths.length) return {ok: false};
    const filePath = filePaths[0];
    const client = getClient(connId);
    const {GridFSBucket} = await import('mongodb');
    const bucket = new GridFSBucket(client.db(dbName), {bucketName});
    const filename = path.basename(filePath);

    await new Promise<void>((resolve, reject) => {
      const readStream = fs.createReadStream(filePath);
      const uploadStream = bucket.openUploadStream(filename);
      readStream.pipe(uploadStream);
      uploadStream.on('finish', () => resolve());
      uploadStream.on('error', reject);
      readStream.on('error', reject);
    });

    return {ok: true, filename};
  });

  ipcMain.handle('data:gridfs:download', async (event, {connId, dbName, bucketName, fileId, filename}) => {
    const win = BrowserWindow.getFocusedWindow();
    const {canceled, filePath} = await dialog.showSaveDialog(win!, {defaultPath: filename});
    if (canceled || !filePath) return {ok: false};
    const client = getClient(connId);
    const {GridFSBucket} = await import('mongodb');
    const bucket = new GridFSBucket(client.db(dbName), {bucketName});
    const id = parseEjson(fileId);

    await new Promise<void>((resolve, reject) => {
      const writeStream = fs.createWriteStream(filePath);
      const downloadStream = bucket.openDownloadStream(id);
      downloadStream.pipe(writeStream);
      writeStream.on('finish', () => resolve());
      downloadStream.on('error', reject);
      writeStream.on('error', reject);
    });

    return {ok: true, filePath};
  });

  ipcMain.handle('data:gridfs:delete', async (event, {connId, dbName, bucketName, fileId}) => {
    const client = getClient(connId);
    const {GridFSBucket} = await import('mongodb');
    const bucket = new GridFSBucket(client.db(dbName), {bucketName});
    const id = parseEjson(fileId);
    await bucket.delete(id);
    return {ok: true};
  });

  ipcMain.handle('data:gridfs:createBucket', async (event, {connId, dbName, bucketName}) => {
    const client = getClient(connId);
    const db = client.db(dbName);
    // Creating an index on `.files` materializes the bucket, matching how
    // mongosh/mongofiles bootstrap an empty GridFS bucket.
    await db.collection(`${bucketName}.files`).createIndex({filename: 1, uploadDate: 1});
    await db.collection(`${bucketName}.chunks`).createIndex({files_id: 1, n: 1}, {unique: true});
    return {ok: true};
  });

  ipcMain.handle('data:gridfs:dropBucket', async (event, {connId, dbName, bucketName}) => {
    const client = getClient(connId);
    const db = client.db(dbName);
    const collections = await db.listCollections().toArray();
    const names = new Set(collections.map((c) => c.name));
    if (names.has(`${bucketName}.files`)) await db.collection(`${bucketName}.files`).drop();
    if (names.has(`${bucketName}.chunks`)) await db.collection(`${bucketName}.chunks`).drop();
    return {ok: true};
  });
}

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