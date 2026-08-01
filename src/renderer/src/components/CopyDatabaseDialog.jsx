import React, {useEffect, useRef, useState} from 'react';
import {useClosing} from '../lib/useClosing.js';
import {Trans, useTranslation} from 'react-i18next';
import {useTaskQueue} from './TaskQueueProvider.jsx';

export default function CopyDatabaseDialog({ source, openConnections, onClose, onCopied }) {
    const { t } = useTranslation();
    const {closing, requestClose} = useClosing(onClose);
    const {enqueue} = useTaskQueue();
    const [targetConnId, setTargetConnId] = useState('');
    const [targetDb, setTargetDb] = useState(source.dbName);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);
    const [queue, setQueue] = useState([]); // [{ name, status: 'pending'|'active'|'done', copied, total }]
    const [overallCopied, setOverallCopied] = useState(0);
    const requestIdRef = useRef(null);
    const taskIdRef = useRef(null);

    useEffect(() => {
        const unsubscribe = window.api.data.onCopyProgress((payload) => {
            if (!requestIdRef.current || payload.requestId !== requestIdRef.current) return;
            switch (payload.phase) {
                case 'start':
                    setQueue((payload.collections || []).map((name) => ({ name, status: 'pending', copied: 0, total: 0 })));
                    setOverallCopied(0);
                    break;
                case 'collection-start':
                    setQueue((prev) => prev.map((item) => item.name === payload.collection
                        ? { ...item, status: 'active', total: payload.totalInCollection || 0 }
                        : item));
                    break;
                case 'progress':
                    setQueue((prev) => prev.map((item) => item.name === payload.collection
                        ? { ...item, copied: payload.copiedInCollection || 0, total: payload.totalInCollection ?? item.total }
                        : item));
                    if (payload.copiedCount !== undefined) {
                        setOverallCopied(payload.copiedCount);
                    }
                    break;
                case 'collection-done':
                    setQueue((prev) => prev.map((item) => item.name === payload.collection
                        ? { ...item, status: 'done', copied: payload.copiedInCollection ?? item.copied, total: payload.totalInCollection ?? item.total }
                        : item));
                    if (payload.copiedCount !== undefined) setOverallCopied(payload.copiedCount);
                    break;
                case 'done':
                    if (payload.copiedCount !== undefined) setOverallCopied(payload.copiedCount);
                    break;
                default:
                    break;
            }
        });
        return unsubscribe;
    }, []);

    function startCopy() {
        if (!targetConnId || !targetDb) {
            setError(t('dialogs.copyDatabase.chooseTarget'));
            return null;
        }
        setError('');
        setQueue([]);
        setOverallCopied(0);
        const requestId = crypto.randomUUID();
        requestIdRef.current = requestId;
        return window.api.data.copyDatabase({
            sourceConnId: source.connId,
            sourceDb: source.dbName,
            targetConnId,
            targetDb,
            requestId
        });
    }

    async function handleCopy() {
        const task = startCopy();
        if (!task) return;
        setBusy(true);
        try {
            const res = await task;
            setResult(res);
            if (onCopied) onCopied();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    function handleCopyInBackground() {
        const task = startCopy();
        if (!task) return;
        const label = t('dialogs.copyDatabase.taskLabel', {dbName: source.dbName, targetDb});
        taskIdRef.current = enqueue(task, label, {
            onDone: () => { if (onCopied) onCopied(); }
        });
        requestClose();
    }

    const otherConnections = openConnections.filter((c) => c.id !== source.connId);
    const doneCount = queue.filter((item) => item.status === 'done').length;

    function statusLabel(item) {
        if (item.status === 'done') return t('dialogs.copyDatabase.statusDone', {count: item.copied});
        if (item.status === 'active') return item.total ? `${item.copied} / ${item.total}` : t('dialogs.copyDatabase.statusCopying');
        return t('dialogs.copyDatabase.statusPending');
    }

    return (
        <div className={`modal-backdrop ${closing ? 'is-closing' : ''}`} onClick={() => requestClose()}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h3>{t('dialogs.copyDatabase.title')}</h3>
                <p className="hint-text">
                    <Trans i18nKey="dialogs.copyDatabase.description"
                           values={{dbName: source.dbName}}
                           components={{bold: <strong/>}}/>
                </p>

                {otherConnections.length === 0 ? (
                    <div className="error-banner">{t('dialogs.copyDatabase.noOtherConnections')}</div>
                ) : (
                    <>
                        <label>{t('dialogs.copyDatabase.targetConnection')}</label>
                        <select value={targetConnId} onChange={(e) => setTargetConnId(e.target.value)} disabled={busy}>
                            <option value="">{t('dialogs.copyDatabase.selectConnection')}</option>
                            {otherConnections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>

                        <label>{t('dialogs.copyDatabase.targetDatabaseName')}</label>
                        <input value={targetDb} onChange={(e) => setTargetDb(e.target.value)} disabled={busy} />
                    </>
                )}

                {queue.length > 0 && (
                    <>
                        <label>{t('dialogs.copyDatabase.queue', {done: doneCount, total: queue.length})}</label>
                        <div className="copy-queue">
                            {queue.map((item) => (
                                <div key={item.name} className={`copy-queue-item ${item.status === 'active' ? 'is-active' : ''} ${item.status === 'done' ? 'is-done' : ''}`}>
                                    <div className="copy-queue-item-head">
                                        <span className="copy-queue-item-name">
                                            {item.status === 'done' ? '✓ ' : item.status === 'active' ? '↻ ' : '· '}{item.name}
                                        </span>
                                        <span className="copy-queue-item-status">{statusLabel(item)}</span>
                                    </div>
                                    {item.status === 'active' && item.total > 0 && (
                                        <div className="update-progress-bar-track">
                                            <div className="update-progress-bar-fill"
                                                 style={{width: `${Math.min(100, (item.copied / item.total) * 100)}%`}}/>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="copy-queue-summary">{t('dialogs.copyDatabase.copiedSoFar', {count: overallCopied})}</div>
                    </>
                )}

                {error && <div className="error-banner">{error}</div>}
                {result && result.ok && (
                    <div className="info-banner">
                        {t('dialogs.copyDatabase.copySuccess', {count: result.copiedCount, collectionCount: result.collectionCount})}
                    </div>
                )}

                <div className="modal-actions">
                    <div className="spacer" />
                    <button onClick={() => requestClose()}
                            disabled={busy}>{result ? t('dialogs.common.close') : t('dialogs.common.cancel')}</button>
                    {!result && (
                        <>
                            <button onClick={handleCopyInBackground} disabled={busy || otherConnections.length === 0}>
                                {t('dialogs.copyDatabase.copyInBackground')}
                            </button>
                            <button className="primary" onClick={handleCopy} disabled={busy || otherConnections.length === 0}>
                                {busy ? t('dialogs.copyDatabase.copying') : t('dialogs.copyDatabase.copy')}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}