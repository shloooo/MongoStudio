import React, {useEffect, useMemo, useState} from 'react';
import {EJSON} from 'bson';
import {parseShell, toShellText} from '../lib/shellSyntax.js';
import {bsonTypeOf} from '../lib/bsonTypes.js';

function idKey(id) {
    const t = bsonTypeOf(id);
    if (t === 'ObjectId') return id.toHexString();
    if (t === 'UUID') return id.toString();
    return String(id);
}

export default function BulkUpdateDialog({selection, filter, onClose, onApplied}) {
    const [loading, setLoading] = useState(true);
    const [byId, setById] = useState(null); // Map id-string -> full doc
    const [text, setText] = useState('');
    const [error, setError] = useState('');
    const [applying, setApplying] = useState(false);
    const [result, setResult] = useState(null);

    useEffect(() => {
        (async () => {
            setLoading(true);
            setError('');
            try {
                const filterValue = parseShell(filter || '{}');
                const docs = [];
                let skip = 0;
                const pageSize = 500;
                for (; ;) {
                    const res = await window.api.data.find({
                        connId: selection.connId,
                        dbName: selection.dbName,
                        collection: selection.collection,
                        filter: EJSON.stringify(filterValue),
                        sort: EJSON.stringify({}),
                        limit: pageSize,
                        skip
                    });
                    const parsed = res.docs.map((d) => EJSON.parse(JSON.stringify(d), {relaxed: false}));
                    docs.push(...parsed);
                    if (parsed.length < pageSize) break;
                    skip += pageSize;
                    if (skip > 20000) break; // safety cap
                }
                const map = {};
                for (const doc of docs) map[idKey(doc._id)] = doc;
                setById(map);
                setText(toShellText(map));
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        })();
    }, [selection, filter]);

    const parsed = useMemo(() => {
        try {
            return {ok: true, value: parseShell(text)};
        } catch (err) {
            return {ok: false, error: err.message};
        }
    }, [text]);

    async function handleApply() {
        if (!parsed.ok || !byId) return;
        setApplying(true);
        setError('');
        let updatedCount = 0;
        let unchangedCount = 0;
        try {
            for (const [key, newDoc] of Object.entries(parsed.value)) {
                const before = byId[key];
                const beforeText = before ? JSON.stringify(EJSON.serialize(before)) : null;
                const afterText = JSON.stringify(EJSON.serialize(newDoc));
                if (beforeText === afterText) {
                    unchangedCount++;
                    continue;
                }
                const idFilter = before ? {_id: before._id} : {_id: newDoc._id};
                const update = {...newDoc};
                delete update._id;
                await window.api.data.updateOne({
                    connId: selection.connId,
                    dbName: selection.dbName,
                    collection: selection.collection,
                    filter: EJSON.stringify(idFilter),
                    update: EJSON.stringify({$set: update})
                });
                updatedCount++;
            }
            setResult({updatedCount, unchangedCount});
            if (onApplied) onApplied();
        } catch (err) {
            setError(err.message);
        } finally {
            setApplying(false);
        }
    }

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal wide" onClick={(e) => e.stopPropagation()}>
                <h3>Bulk Update (all matching documents, by ID)</h3>
                <p className="hint-text">
                    Every document matching the current filter, keyed by its <code>_id</code>. Edit any document's
                    fields and
                    apply — only documents that actually changed are written back.
                </p>
                {loading ? (
                    <div className="info-banner">Loading documents...</div>
                ) : (
                    <textarea
                        className={`json-editor ${!parsed.ok ? 'has-error' : ''}`}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        spellCheck={false}
                        rows={22}
                    />
                )}
                {!parsed.ok && <div className="error-banner">{parsed.error}</div>}
                {error && <div className="error-banner">{error}</div>}
                {result && (
                    <div className="info-banner">
                        Updated {result.updatedCount} document(s), {result.unchangedCount} unchanged.
                    </div>
                )}
                <div className="modal-actions">
                    <div className="spacer"/>
                    <button onClick={onClose}>{result ? 'Close' : 'Cancel'}</button>
                    {!result && (
                        <button className="primary" onClick={handleApply} disabled={loading || !parsed.ok || applying}>
                            {applying ? 'Applying...' : 'Apply Changes'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}