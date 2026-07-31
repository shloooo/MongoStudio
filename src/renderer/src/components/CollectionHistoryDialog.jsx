import React, {useEffect, useMemo, useState} from 'react';
import {createPortal} from 'react-dom';
import {useTranslation} from 'react-i18next';
import {EJSON} from 'bson';
import {reportError} from '../lib/errorBus.js';
import {useClosing} from '../lib/useClosing.js';
import {useConfirm} from './ConfirmProvider.jsx';

const OP_LABEL_KEY = {
    insertOne: 'opInsertOne',
    updateOne: 'opUpdateOne',
    updateMany: 'opUpdateMany',
    deleteOne: 'opDeleteOne',
    deleteMany: 'opDeleteMany'
};

function toPlain(doc) {
    try {
        return EJSON.deserialize(doc);
    } catch {
        return doc;
    }
}

function stableStringify(value) {
    // Use EJSON so BSON types (Long, Decimal128, Date, ObjectId, ...) compare
    // by canonical value instead of by their internal object shape.
    let ejson;
    try {
        ejson = EJSON.serialize({v: value});
    } catch {
        ejson = {v: value};
    }
    const sortKeys = (val) => {
        if (Array.isArray(val)) return val.map(sortKeys);
        if (val && typeof val === 'object') {
            return Object.keys(val).sort().reduce((acc, k) => { acc[k] = sortKeys(val[k]); return acc; }, {});
        }
        return val;
    };
    return JSON.stringify(sortKeys(ejson));
}

function formatValue(value) {
    if (value === undefined) return undefined;
    if (typeof value === 'string') return JSON.stringify(value);
    if (value && typeof value.toString === 'function' && typeof value === 'object') {
        // BSON wrapper types (Long, ObjectId, Decimal128, ...) stringify best via toString/EJSON.
        try {
            const ejson = EJSON.serialize({v: value}, {relaxed: true});
            if (ejson && typeof ejson.v !== 'object') return JSON.stringify(ejson.v);
        } catch {
            // fall through
        }
    }
    return JSON.stringify(value, null, 2);
}

// Pairs up before/after docs by _id and produces a per-field diff for each pair.
function buildDocDiffs(beforeRaw, afterRaw) {
    const before = beforeRaw.map(toPlain);
    const after = afterRaw.map(toPlain);
    const idKey = (d) => (d && d._id !== undefined ? stableStringify(d._id) : null);

    const beforeById = new Map(before.map((d) => [idKey(d), d]));
    const afterById = new Map(after.map((d) => [idKey(d), d]));
    const allIds = new Set([...beforeById.keys(), ...afterById.keys()]);

    const diffs = [];
    for (const id of allIds) {
        const b = beforeById.get(id) || null;
        const a = afterById.get(id) || null;
        const fields = new Set([...(b ? Object.keys(b) : []), ...(a ? Object.keys(a) : [])]);
        const fieldDiffs = [];
        for (const field of fields) {
            const hasBefore = !!b && Object.prototype.hasOwnProperty.call(b, field);
            const hasAfter = !!a && Object.prototype.hasOwnProperty.call(a, field);
            const beforeVal = hasBefore ? b[field] : undefined;
            const afterVal = hasAfter ? a[field] : undefined;
            const unchanged = hasBefore && hasAfter && stableStringify(beforeVal) === stableStringify(afterVal);
            let status = 'unchanged';
            if (!hasBefore && hasAfter) status = 'added';
            else if (hasBefore && !hasAfter) status = 'removed';
            else if (!unchanged) status = 'changed';
            fieldDiffs.push({field, hasBefore, hasAfter, beforeVal, afterVal, status});
        }
        fieldDiffs.sort((x, y) => {
            if (x.field === '_id') return -1;
            if (y.field === '_id') return 1;
            return x.field.localeCompare(y.field);
        });
        diffs.push({id, fieldDiffs});
    }
    return diffs;
}

function DocDiff({diff, t, onlyChanged}) {
    const rows = onlyChanged ? diff.fieldDiffs.filter((f) => f.status !== 'unchanged') : diff.fieldDiffs;
    if (onlyChanged && rows.length === 0) return null;
    return (
        <div className="history-doc-diff">
            {rows.map(({field, hasBefore, hasAfter, beforeVal, afterVal, status}) => (
                <div key={field} className={`history-diff-field-row status-${status}`}>
                    <div className="history-diff-field-name">{field}</div>
                    <div className="history-diff-field-before">
                        {hasBefore ? <pre>{formatValue(beforeVal)}</pre> : <span className="history-diff-empty">—</span>}
                    </div>
                    <div className="history-diff-field-after">
                        {hasAfter ? <pre>{formatValue(afterVal)}</pre> : <span className="history-diff-empty">—</span>}
                    </div>
                </div>
            ))}
        </div>
    );
}

function HistoryEntryRow({entry, t, onUndo, undoingId, onlyChanged}) {
    const [expanded, setExpanded] = useState(false);
    const opLabel = t(`dialogs.history.${OP_LABEL_KEY[entry.opType] || 'opUpdateOne'}`);
    const when = new Date(entry.at).toLocaleString();
    const diffs = useMemo(() => buildDocDiffs(entry.before, entry.after), [entry]);

    return (
        <div className={`history-entry ${entry.undone ? 'is-undone' : ''}`}>
            <div className="history-entry-row">
                <span className="history-op-badge">{opLabel}</span>
                <span className="history-summary">{entry.summary}</span>
                <span className="history-time">{when}</span>
                <div className="spacer"/>
                <button className="tiny-btn" onClick={() => setExpanded((v) => !v)}>
                    {t('dialogs.history.viewDiff')}
                </button>
                {entry.undone ? (
                    <span className="history-undone-tag">{t('dialogs.history.undone')}</span>
                ) : (
                    <button
                        className="tiny-btn history-undo-btn"
                        disabled={undoingId === entry.id}
                        onClick={() => onUndo(entry)}
                    >
                        {undoingId === entry.id ? t('dialogs.history.undoing') : t('dialogs.history.undo')}
                    </button>
                )}
            </div>
            <div className={`history-diff-wrap ${expanded ? 'is-open' : ''}`}>
                <div className="history-diff">
                    <div className="history-diff-header-row">
                        <div className="history-diff-field-name">{t('dialogs.history.field')}</div>
                        <div className="history-diff-field-before">{t('dialogs.history.before')}</div>
                        <div className="history-diff-field-after">{t('dialogs.history.after')}</div>
                    </div>
                    {diffs.map((d) => (
                        <DocDiff key={d.id} diff={d} t={t} onlyChanged={onlyChanged}/>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default function CollectionHistoryDialog({selection, onClose, onUndone}) {
    const {t} = useTranslation();
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [undoingId, setUndoingId] = useState(null);
    const [onlyChanged, setOnlyChanged] = useState(false);
    const confirmDialog = useConfirm();
    const {closing, requestClose} = useClosing(onClose);

    async function load() {
        setLoading(true);
        try {
            const result = await window.api.data.historyList({
                connId: selection.connId,
                dbName: selection.dbName,
                collection: selection.collection
            });
            setEntries(result || []);
        } catch (err) {
            reportError(err.message, 'Load history');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        window.api.settings.get().then((s) => {
            setOnlyChanged(!!(s && s.showHistoryChangesOnly));
        });
    }, [selection]);

    function handleToggleOnlyChanged(value) {
        setOnlyChanged(value);
        window.api.settings.set('showHistoryChangesOnly', value);
    }

    async function handleUndo(entry) {
        const ok = await confirmDialog(t('dialogs.history.undoConfirm'), {
            title: t('dialogs.history.undoConfirmTitle'),
            confirmLabel: t('dialogs.history.undo')
        });
        if (!ok) return;
        setUndoingId(entry.id);
        try {
            await window.api.data.historyUndo({historyId: entry.id});
            await load();
            if (onUndone) onUndone();
        } catch (err) {
            reportError(err.message, 'Undo change');
        } finally {
            setUndoingId(null);
        }
    }

    async function handleClearAll() {
        const ok = await confirmDialog(t('dialogs.history.clearAllConfirm'), {
            title: t('dialogs.history.clearAllConfirmTitle'),
            confirmLabel: t('dialogs.history.clearAll')
        });
        if (!ok) return;
        try {
            await window.api.data.historyClear({
                connId: selection.connId,
                dbName: selection.dbName,
                collection: selection.collection
            });
            await load();
        } catch (err) {
            reportError(err.message, 'Clear history');
        }
    }

    return createPortal(
        <div className={`modal-backdrop ${closing ? 'is-closing' : ''}`} onClick={() => requestClose()}>
            <div className="modal wide" onClick={(e) => e.stopPropagation()}>
                <div className="history-header-row">
                    <h3>{t('dialogs.history.title')}</h3>
                    <label className="history-only-changed-toggle">
                        <input type="checkbox" checked={onlyChanged} onChange={(e) => handleToggleOnlyChanged(e.target.checked)}/>
                        {t('dialogs.history.onlyChanged')}
                    </label>
                </div>
                {loading ? (
                    <p className="hint-text">…</p>
                ) : entries.length === 0 ? (
                    <p className="hint-text">{t('dialogs.history.empty')}</p>
                ) : (
                    <div className="history-list">
                        {entries.map((entry) => (
                            <HistoryEntryRow key={entry.id} entry={entry} t={t} onUndo={handleUndo} undoingId={undoingId} onlyChanged={onlyChanged}/>
                        ))}
                    </div>
                )}
                <div className="modal-actions">
                    <button onClick={handleClearAll} disabled={entries.length === 0} className="danger">
                        {t('dialogs.history.clearAll')}
                    </button>
                    <div className="spacer"/>
                    <button onClick={() => requestClose()}>{t('dialogs.history.close')}</button>
                </div>
            </div>
        </div>,
        document.body
    );
}