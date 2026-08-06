import React, {useEffect, useState} from 'react';
import {useClosing} from '../../lib/useClosing.js';
import {Trans, useTranslation} from 'react-i18next';
import {useTaskQueue} from '../lib/TaskQueueProvider.jsx';
import {reportError} from '../../lib/errorBus.js';
import Select from '../lib/Select.jsx';

export default function CopyDatabaseDialog({source, openConnections, onClose, onCopied}) {
    const {t, i18n} = useTranslation();
    const {closing, requestClose} = useClosing(onClose);
    const {enqueue, updateTaskProgress} = useTaskQueue();
    const [targetConnId, setTargetConnId] = useState('');
    const [targetDb, setTargetDb] = useState(source.dbName);
    const [loadingCollections, setLoadingCollections] = useState(true);
    const [collections, setCollections] = useState([]); // [{ name, count }] sorted alphabetically
    const [selected, setSelected] = useState(new Set());
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        setLoadingCollections(true);
        window.api.conn.listCollectionsWithCounts(source.connId, source.dbName).then((cols) => {
            if (cancelled) return;
            const sorted = [...(cols || [])].sort((a, b) => a.name.localeCompare(b.name));
            setCollections(sorted);
            setSelected(new Set(sorted.map((c) => c.name)));
        }).catch((err) => {
            reportError(err.message, 'List collections');
        }).finally(() => {
            if (!cancelled) setLoadingCollections(false);
        });
        return () => {
            cancelled = true;
        };
    }, [source.connId, source.dbName]);

    function toggleCollection(name) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    }

    function toggleAll() {
        setSelected((prev) => (prev.size === collections.length ? new Set() : new Set(collections.map((c) => c.name))));
    }

    function formatCount(count) {
        return count.toLocaleString(i18n.language);
    }

    const otherConnections = openConnections.filter((c) => c.id !== source.connId);
    const currentConnection = openConnections.find((c) => c.id === source.connId);
    const connectionOptions = [
        ...(currentConnection
            ? [{
                value: currentConnection.id,
                label: t('dialogs.copyDatabase.currentConnection', {name: currentConnection.name})
            }]
            : []),
        ...otherConnections.map((c) => ({value: c.id, label: c.name}))
    ];
    const isSameLocation = targetConnId === source.connId && targetDb === source.dbName;

    function handleCopy() {
        if (!targetConnId || !targetDb) {
            setError(t('dialogs.copyDatabase.chooseTarget'));
            return;
        }
        if (isSameLocation) {
            setError(t('dialogs.copyDatabase.sameDatabase'));
            return;
        }
        if (selected.size === 0) {
            setError(t('dialogs.copyDatabase.noCollectionsSelected'));
            return;
        }
        setError('');
        const requestId = crypto.randomUUID();
        const allSelected = selected.size === collections.length;
        const task = window.api.data.copyDatabase({
            sourceConnId: source.connId,
            sourceDb: source.dbName,
            targetConnId,
            targetDb,
            collections: allSelected ? [] : Array.from(selected),
            requestId
        });

        const label = t('dialogs.copyDatabase.taskLabel', {dbName: source.dbName, targetDb});
        const id = enqueue(task, label, {
            onDone: () => {
                if (onCopied) onCopied();
            },
            onCancel: () => window.api.data.cancelCopy(requestId)
        });

        let bgQueue = [];
        let bgOverallCopied = 0;

        function reportProgress() {
            if (bgQueue.length === 0) return;
            const doneCount = bgQueue.filter((item) => item.status === 'done').length;
            updateTaskProgress(id, {
                percent: Math.min(100, (doneCount / bgQueue.length) * 100),
                detail: t('taskQueue.progressCollections', {done: doneCount, total: bgQueue.length})
                    + ' \u00b7 ' + t('dialogs.copyDatabase.copiedSoFar', {count: bgOverallCopied}),
                subitems: bgQueue
            });
        }

        const unsubscribeQueueProgress = window.api.data.onCopyProgress((payload) => {
            if (payload.requestId !== requestId) return;
            switch (payload.phase) {
                case 'start':
                    bgQueue = (payload.collections || []).map((name) => ({
                        name,
                        status: 'pending',
                        copied: 0,
                        total: 0
                    }));
                    bgOverallCopied = 0;
                    break;
                case 'collection-start':
                    bgQueue = bgQueue.map((item) => item.name === payload.collection
                        ? {...item, status: 'active', total: payload.totalInCollection || 0}
                        : item);
                    break;
                case 'progress':
                    bgQueue = bgQueue.map((item) => item.name === payload.collection
                        ? {
                            ...item,
                            copied: payload.copiedInCollection || 0,
                            total: payload.totalInCollection ?? item.total
                        }
                        : item);
                    if (payload.copiedCount !== undefined) bgOverallCopied = payload.copiedCount;
                    break;
                case 'collection-done':
                    bgQueue = bgQueue.map((item) => item.name === payload.collection
                        ? {
                            ...item,
                            status: 'done',
                            copied: payload.copiedInCollection ?? item.copied,
                            total: payload.totalInCollection ?? item.total
                        }
                        : item);
                    if (payload.copiedCount !== undefined) bgOverallCopied = payload.copiedCount;
                    break;
                case 'done':
                case 'cancelled':
                    if (payload.copiedCount !== undefined) bgOverallCopied = payload.copiedCount;
                    break;
                default:
                    break;
            }
            reportProgress();
        });
        task.finally(unsubscribeQueueProgress);
        requestClose();
    }

    return (
        <div className={`modal-backdrop ${closing ? 'is-closing' : ''}`} onClick={() => requestClose()}>
            <div className="modal copy-modal" onClick={(e) => e.stopPropagation()}>
                <h3>{t('dialogs.copyDatabase.title')}</h3>
                <p className="hint-text">
                    <Trans i18nKey="dialogs.copyDatabase.description"
                           values={{dbName: source.dbName}}
                           components={{bold: <strong/>}}/>
                </p>

                {connectionOptions.length === 0 ? (
                    <div className="error-banner">{t('dialogs.copyDatabase.noOtherConnections')}</div>
                ) : (
                    <div className="row">
                        <div>
                            <label>{t('dialogs.copyDatabase.targetConnection')}</label>
                            <Select
                                value={targetConnId}
                                onChange={setTargetConnId}
                                placeholder={t('dialogs.copyDatabase.selectConnection')}
                                options={connectionOptions}
                            />
                        </div>
                        <div>
                            <label>{t('dialogs.copyDatabase.targetDatabaseName')}</label>
                            <input value={targetDb} onChange={(e) => setTargetDb(e.target.value)}/>
                        </div>
                    </div>
                )}

                {isSameLocation && (
                    <div className="error-banner">{t('dialogs.copyDatabase.sameDatabase')}</div>
                )}

                {connectionOptions.length > 0 && (
                    <>
                        <div className="sql-export-field-list-header sql-export-field-list-header--titled">
                            <label
                                className="sql-export-field-list-title">{t('dialogs.copyDatabase.collections')}</label>
                            {!loadingCollections && collections.length > 0 && (
                                <button className="tiny-btn" onClick={toggleAll}>
                                    {selected.size === collections.length ? t('dialogs.fieldExport.deselectAll') : t('dialogs.fieldExport.selectAll')}
                                </button>
                            )}
                        </div>
                        {loadingCollections ? (
                            <p className="hint-text">{t('dialogs.copyDatabase.loadingCollections')}</p>
                        ) : (
                            <div className="sql-export-field-list">
                                {collections.map((c) => (
                                    <label key={c.name} className="sql-export-field-row">
                                        <input type="checkbox" checked={selected.has(c.name)}
                                               onChange={() => toggleCollection(c.name)}/>
                                        <span className="sql-export-field-row-name">{c.name}</span>
                                        <span className="sql-export-field-row-count">{formatCount(c.count)}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {error && <div className="error-banner">{error}</div>}

                <div className="modal-actions">
                    <div className="spacer"/>
                    <button onClick={() => requestClose()}>{t('dialogs.common.cancel')}</button>
                    <button className="primary" onClick={handleCopy}
                            disabled={connectionOptions.length === 0 || loadingCollections || !targetDb || isSameLocation || selected.size === 0}>
                        {t('dialogs.copyDatabase.copy')}
                    </button>
                </div>
            </div>
        </div>
    );
}