import React, {useEffect, useState} from 'react';
import {Trans, useTranslation} from 'react-i18next';
import {useClosing} from '../../lib/useClosing.js';
import {useTaskQueue} from '../lib/TaskQueueProvider.jsx';
import {reportError} from '../../lib/errorBus.js';
import Select from '../lib/Select.jsx';

export default function CopyCollectionDialog({source, openConnections, onClose, onCopied}) {
    const {t} = useTranslation();
    const {closing, requestClose} = useClosing(onClose);
    const {enqueue, updateTaskProgress} = useTaskQueue();
    const [targetConnId, setTargetConnId] = useState('');
    const [targetDbs, setTargetDbs] = useState([]);
    const [targetDb, setTargetDb] = useState('');
    const [targetCollection, setTargetCollection] = useState(source.collection);
    const [loadingFields, setLoadingFields] = useState(true);
    const [fields, setFields] = useState([]);
    const [selected, setSelected] = useState(new Set());
    const [error, setError] = useState('');

    useEffect(() => {
        if (!targetConnId) {
            setTargetDbs([]);
            return;
        }
        window.api.conn.listDatabases(targetConnId).then((dbs) => {
            const sorted = [...dbs].sort((a, b) => a.name.localeCompare(b.name));
            setTargetDbs(sorted);
            if (sorted.length && !sorted.some((d) => d.name === targetDb)) setTargetDb(sorted[0].name);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [targetConnId]);

    useEffect(() => {
        let cancelled = false;
        setLoadingFields(true);
        window.api.data.listCollectionFields({
            connId: source.connId,
            dbName: source.dbName,
            collection: source.collection
        }).then((result) => {
            if (cancelled) return;
            setFields(result || []);
            setSelected(new Set(result || []));
        }).catch((err) => {
            reportError(err.message, 'List collection fields');
        }).finally(() => {
            if (!cancelled) setLoadingFields(false);
        });
        return () => {
            cancelled = true;
        };
    }, [source.connId, source.dbName, source.collection]);

    function toggleField(field) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(field)) next.delete(field);
            else next.add(field);
            return next;
        });
    }

    function toggleAll() {
        setSelected((prev) => (prev.size === fields.length ? new Set() : new Set(fields)));
    }

    const otherConnections = openConnections.filter((c) => c.id !== source.connId);
    const currentConnection = openConnections.find((c) => c.id === source.connId);
    const connectionOptions = [
        ...(currentConnection
            ? [{
                value: currentConnection.id,
                label: t('dialogs.copyCollection.currentConnection', {name: currentConnection.name})
            }]
            : []),
        ...otherConnections.map((c) => ({value: c.id, label: c.name}))
    ];
    const isSameLocation = targetConnId === source.connId && targetDb === source.dbName && targetCollection === source.collection;

    function handleCopy() {
        if (!targetConnId || !targetDb || !targetCollection) {
            setError(t('dialogs.copyCollection.chooseTarget'));
            return;
        }
        if (isSameLocation) {
            setError(t('dialogs.copyCollection.sameLocation'));
            return;
        }
        if (selected.size === 0) {
            setError(t('dialogs.copyCollection.noFieldsSelected'));
            return;
        }
        setError('');
        const requestId = crypto.randomUUID();
        const allSelected = selected.size === fields.length;
        const task = window.api.data.copyCollection({
            sourceConnId: source.connId,
            sourceDb: source.dbName,
            sourceCollection: source.collection,
            targetConnId,
            targetDb,
            targetCollection,
            fields: allSelected ? [] : Array.from(selected),
            requestId
        });

        const label = t('dialogs.copyCollection.taskLabel', {
            collection: source.collection,
            target: targetCollection
        });
        const id = enqueue(task, label, {
            onDone: () => {
                if (onCopied) onCopied();
            },
            onCancel: () => window.api.data.cancelCopy(requestId)
        });
        const unsubscribeQueueProgress = window.api.data.onCopyProgress((payload) => {
            if (payload.requestId !== requestId) return;
            if (payload.phase !== 'start' && payload.phase !== 'progress' && payload.phase !== 'done') return;
            const copiedCount = payload.copiedCount || 0;
            const totalInCollection = payload.totalInCollection || 0;
            if (!totalInCollection) return;
            updateTaskProgress(id, {
                percent: Math.min(100, (copiedCount / totalInCollection) * 100),
                detail: t('taskQueue.progressDocs', {copied: copiedCount, total: totalInCollection})
            });
        });
        task.finally(unsubscribeQueueProgress);
        requestClose();
    }

    return (
        <div className={`modal-backdrop ${closing ? 'is-closing' : ''}`} onClick={() => requestClose()}>
            <div className="modal copy-modal" onClick={(e) => e.stopPropagation()}>
                <h3>{t('dialogs.copyCollection.title')}</h3>
                <p className="hint-text">
                    <Trans i18nKey="dialogs.copyCollection.description"
                           values={{path: `${source.dbName}.${source.collection}`}}
                           components={{bold: <strong/>}}/>
                </p>

                {connectionOptions.length === 0 ? (
                    <div className="error-banner">{t('dialogs.copyCollection.noOtherConnections')}</div>
                ) : (
                    <>
                        <div className="row">
                            <div>
                                <label>{t('dialogs.copyCollection.targetConnection')}</label>
                                <Select
                                    value={targetConnId}
                                    onChange={setTargetConnId}
                                    placeholder={t('dialogs.copyCollection.selectConnection')}
                                    options={connectionOptions}
                                />
                            </div>
                            {targetConnId && (
                                <div>
                                    <label>{t('dialogs.copyCollection.targetDatabase')}</label>
                                    <Select
                                        value={targetDb}
                                        onChange={setTargetDb}
                                        options={targetDbs.map((d) => ({value: d.name, label: d.name}))}
                                    />
                                </div>
                            )}
                        </div>

                        {targetConnId && (
                            <div className="row">
                                <div>
                                    <label>{t('dialogs.copyCollection.targetCollectionName')}</label>
                                    <input value={targetCollection}
                                           onChange={(e) => setTargetCollection(e.target.value)}/>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {isSameLocation && (
                    <div className="error-banner">{t('dialogs.copyCollection.sameLocation')}</div>
                )}

                {connectionOptions.length > 0 && (
                    <>
                        <div className="sql-export-field-list-header sql-export-field-list-header--titled">
                            <label className="sql-export-field-list-title">{t('dialogs.copyCollection.fields')}</label>
                            {!loadingFields && fields.length > 0 && (
                                <button className="tiny-btn" onClick={toggleAll}>
                                    {selected.size === fields.length ? t('dialogs.fieldExport.deselectAll') : t('dialogs.fieldExport.selectAll')}
                                </button>
                            )}
                        </div>
                        {loadingFields ? (
                            <p className="hint-text">{t('dialogs.copyCollection.loadingFields')}</p>
                        ) : (
                            <div className="sql-export-field-list">
                                {fields.map((f) => (
                                    <label key={f} className="sql-export-field-row">
                                        <input type="checkbox" checked={selected.has(f)}
                                               onChange={() => toggleField(f)}/>
                                        {f}
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
                            disabled={connectionOptions.length === 0 || loadingFields || !targetDb || !targetCollection || isSameLocation || selected.size === 0}>
                        {t('dialogs.copyCollection.copy')}
                    </button>
                </div>
            </div>
        </div>
    );
}