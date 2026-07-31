import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {EJSON} from 'bson';
import {getAppFolder} from './utils/fs.utils.js';

export type HistoryOpType = 'insertOne' | 'updateOne' | 'updateMany' | 'deleteOne' | 'deleteMany';

export interface HistoryEntry {
    id: string;
    connId: string;
    connLabel?: string;
    dbName: string;
    collection: string;
    opType: HistoryOpType;
    at: string;
    summary: string;
    before: any[];
    after: any[];
    undone: boolean;
}

const MAX_ENTRIES = 500;

function historyFilePath(): string {
    return path.join(getAppFolder(), 'history.json');
}

function load(): HistoryEntry[] {
    try {
        const raw = fs.readFileSync(historyFilePath(), 'utf-8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed;
    } catch {
        return [];
    }
}

function persist(entries: HistoryEntry[]): void {
    fs.mkdirSync(path.dirname(historyFilePath()), {recursive: true});
    fs.writeFileSync(historyFilePath(), JSON.stringify(entries, null, 2), 'utf-8');
}

export function addHistoryEntry(entry: Omit<HistoryEntry, 'id' | 'at' | 'undone'>): HistoryEntry {
    const full: HistoryEntry = {
        ...entry,
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        undone: false
    };
    const entries = load();
    entries.unshift(full);
    while (entries.length > MAX_ENTRIES) entries.pop();
    persist(entries);
    return full;
}

export function listHistory(connId: string, dbName: string, collection: string): HistoryEntry[] {
    return load().filter((e) => e.connId === connId && e.dbName === dbName && e.collection === collection);
}

export function getHistoryEntry(id: string): HistoryEntry | undefined {
    return load().find((e) => e.id === id);
}

export function markUndone(id: string): void {
    const entries = load();
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) return;
    entries[idx].undone = true;
    persist(entries);
}

export function clearHistory(connId: string, dbName: string, collection: string): void {
    const entries = load().filter((e) => !(e.connId === connId && e.dbName === dbName && e.collection === collection));
    persist(entries);
}

export function serializeDocs(docs: any[]): any[] {
    return docs.map((d) => EJSON.serialize(d));
}