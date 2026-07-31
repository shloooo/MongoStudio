import {parseShell} from './shellSyntax.js';

const CHAIN_METHODS = new Set(['sort', 'limit', 'skip', 'projection']);

const ROOT_METHODS = new Set([
    'find', 'findOne', 'insertOne', 'insertMany',
    'updateOne', 'updateMany', 'deleteOne', 'deleteMany',
    'countDocuments', 'aggregate', 'createIndex', 'getIndexes',
    'drop', 'distinct'
]);

const DB_LEVEL_METHODS = new Set(['getCollectionNames', 'stats']);

function splitTopLevelArgs(argsSrc) {
    const parts = [];
    let depth = 0;
    let current = '';
    let inString = null;
    for (let i = 0; i < argsSrc.length; i++) {
        const ch = argsSrc[i];
        if (inString) {
            current += ch;
            if (ch === '\\') {
                current += argsSrc[++i] ?? '';
                continue;
            }
            if (ch === inString) inString = null;
            continue;
        }
        if (ch === '"' || ch === "'") {
            inString = ch;
            current += ch;
            continue;
        }
        if (ch === '{' || ch === '[' || ch === '(') depth++;
        if (ch === '}' || ch === ']' || ch === ')') depth--;
        if (ch === ',' && depth === 0) {
            parts.push(current);
            current = '';
            continue;
        }
        current += ch;
    }
    if (current.trim() !== '') parts.push(current);
    return parts.map((p) => p.trim()).filter((p) => p !== '');
}

function parseArgs(argsSrc) {
    return splitTopLevelArgs(argsSrc).map((part) => parseShell(part));
}

function matchParen(src, open) {
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '(') depth++;
        else if (src[i] === ')') {
            depth--;
            if (depth === 0) return i;
        }
    }
    throw new Error('Unmatched "(" in command');
}

export function parseShellCommand(line) {
    const trimmed = line.trim().replace(/;\s*$/, '');
    if (!trimmed.startsWith('db.')) {
        throw new Error('Commands must start with "db." (e.g. db.users.find({}))');
    }

    const rest = trimmed.slice(3); // strip "db."
    const calls = [];
    let i = 0;
    let collection = null;

    const firstDot = rest.indexOf('.');
    const firstParen = rest.indexOf('(');
    const firstNameEnd = firstDot === -1 ? firstParen : (firstParen === -1 ? firstDot : Math.min(firstDot, firstParen));
    if (firstNameEnd === -1) throw new Error('Incomplete command');
    const firstName = rest.slice(0, firstNameEnd);

    if (DB_LEVEL_METHODS.has(firstName) && rest[firstNameEnd] === '(') {
        const close = matchParen(rest, firstNameEnd);
        calls.push({name: firstName, args: parseArgs(rest.slice(firstNameEnd + 1, close))});
        i = close + 1;
    } else {
        collection = firstName;
        i = firstNameEnd;
        if (rest[i] !== '.') throw new Error(`Expected "." after collection name "${collection}"`);
        i++; // skip '.'
    }

    while (i < rest.length) {
        if (rest[i] === '.') {
            i++;
            continue;
        }
        const dot = rest.indexOf('.', i);
        const paren = rest.indexOf('(', i);
        if (paren === -1) throw new Error('Expected "(" after method name');
        const nameEnd = dot === -1 ? paren : Math.min(dot, paren);
        const name = rest.slice(i, nameEnd).trim();
        if (rest[nameEnd] !== '(' && rest.slice(nameEnd).trim() !== '') {
            // there's more text before the paren that isn't a dot - malformed
        }
        const parenStart = rest.indexOf('(', nameEnd);
        if (parenStart === -1) throw new Error(`Expected "(" after ".${name}"`);
        const close = matchParen(rest, parenStart);
        calls.push({name, args: parseArgs(rest.slice(parenStart + 1, close))});
        i = close + 1;
    }

    if (calls.length === 0) throw new Error('No method call found');

    const [root, ...chain] = calls;
    if (collection !== null && !ROOT_METHODS.has(root.name)) {
        throw new Error(`Unsupported method "${root.name}". Supported: ${Array.from(ROOT_METHODS).join(', ')}`);
    }
    if (collection === null && !DB_LEVEL_METHODS.has(root.name)) {
        throw new Error(`Unsupported db-level method "${root.name}". Supported: ${Array.from(DB_LEVEL_METHODS).join(', ')}`);
    }
    for (const c of chain) {
        if (!CHAIN_METHODS.has(c.name)) {
            throw new Error(`Unsupported chained method ".${c.name}()". Supported: ${Array.from(CHAIN_METHODS).join(', ')}`);
        }
    }

    return {collection, root, chain};
}