import React, {useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import {useTranslation} from 'react-i18next';
import {useClosing} from '../lib/useClosing.js';
import {useConfirm} from './ConfirmProvider.jsx';
import {reportError} from '../lib/errorBus.js';
import {useTaskQueue} from './TaskQueueProvider.jsx';

export default function BackupDialog({connection, onClose}) {
    const {t, i18n} = useTranslation();
    const confirmDialog = useConfirm();
    const {enqueue, updateTaskProgress} = useTaskQueue();
    const {closing, requestClose} = useClosing(onClose);
    const [tab, setTab] = useState('create');
    const [backups, setBackups] = useState(null);
    const [loadingDbTree, setLoadingDbTree] = useState(true);
    const [dbTree, setDbTree] = useState([]); // [{ name, collections: [{ name, count }] }]
    const [selection, setSelection] = useState({}); // { [dbName]: Set<collectionName> }
    const [collapsed, setCollapsed] = useState(new Set());

    function loadBackups() {
        window.api.backup.listInternal().then((list) => {
            setBackups((list || []).filter((b) => b.connId === connection.connId));
        }).catch((err) => reportError(err.message, 'List backups'));
    }

    useEffect(() => {
        if (tab === 'manage') loadBackups();
    }, [tab]);

    useEffect(() => {
        let cancelled = false;
        setLoadingDbTree(true);
        window.api.backup.listCollections({connId: connection.connId}).then((dbs) => {
            if (cancelled) return;
            setDbTree(dbs || []);
            const initial = {};
            (dbs || []).forEach((db) => {
                initial[db.name] = new Set(db.collections.map((c) => c.name));
            });
            setSelection(initial);
            setCollapsed(new Set((dbs || []).map((db) => db.name)));
        }).catch((err) => {
            reportError(err.message, 'List backup collections');
        }).finally(() => {
            if (!cancelled) setLoadingDbTree(false);
        });
        return () => { cancelled = true; };
    }, [connection.connId]);

    function formatCount(count) {
        return count.toLocaleString(i18n.language);
    }

    function toggleCollapsed(dbName) {
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(dbName)) next.delete(dbName);
            else next.add(dbName);
            return next;
        });
    }

    function toggleCollection(dbName, collName) {
        setSelection((prev) => {
            const next = new Set(prev[dbName] || []);
            if (next.has(collName)) next.delete(collName);
            else next.add(collName);
            return {...prev, [dbName]: next};
        });
    }

    function toggleDb(dbName) {
        const db = dbTree.find((d) => d.name === dbName);
        if (!db) return;
        setSelection((prev) => {
            const current = prev[dbName] || new Set();
            const allSelected = current.size === db.collections.length;
            const next = allSelected ? new Set() : new Set(db.collections.map((c) => c.name));
            return {...prev, [dbName]: next};
        });
    }

    function selectedCollectionCount() {
        return Object.values(selection).reduce((sum, set) => sum + set.size, 0);
    }

    function buildSelectionPayload() {
        const payload = {};
        for (const [dbName, set] of Object.entries(selection)) {
            if (set.size > 0) payload[dbName] = Array.from(set);
        }
        return payload;
    }

    function runQueued(taskFn, label, opts = {}) {
        const requestId = crypto.randomUUID();
        const task = taskFn(requestId);
        let taskId;

        const unsubscribe = window.api.backup.onProgress((payload) => {
            if (payload.requestId !== requestId) return;
            const percent = payload.totalCount ? (payload.doneCount / payload.totalCount) * 100 : 0;
            updateTaskProgress(taskId, {
                percent,
                detail: t('dialogs.backup.backingUp', {db: payload.db, collection: payload.collection})
            });
        });

        taskId = enqueue(task, label, {
            onCancel: () => window.api.backup.cancel({requestId}),
            onDone: (res) => {
                unsubscribe();
                if (opts.onDone) opts.onDone(res);
            },
            onError: () => unsubscribe()
        });
    }

    function handleCreateInternal() {
        if (selectedCollectionCount() === 0) return;
        runQueued(
            (requestId) => window.api.backup.createInternal({
                connId: connection.connId,
                connLabel: connection.connLabel,
                selection: buildSelectionPayload(),
                requestId
            }),
            `${t('dialogs.backup.createInternal')}: ${connection.connLabel}`
        );
    }

    function handleCreateExternal() {
        if (selectedCollectionCount() === 0) return;
        runQueued(
            (requestId) => window.api.backup.createExternal({
                connId: connection.connId,
                connLabel: connection.connLabel,
                selection: buildSelectionPayload(),
                requestId
            }),
            `${t('dialogs.backup.createExternal')}: ${connection.connLabel}`
        );
    }

    async function handleRestore(backup) {
        const ok = await confirmDialog(t('dialogs.backup.restoreConfirm'), {
            title: t('dialogs.backup.restoreConfirmTitle'),
            confirmLabel: t('dialogs.backup.restore')
        });
        if (!ok) return;
        runQueued(
            (requestId) => window.api.backup.restoreInternal({
                id: backup.id,
                targetConnId: connection.connId,
                requestId
            }),
            `${t('dialogs.backup.restore')}: ${connection.connLabel}`
        );
    }

    async function handleRestoreExternal() {
        const ok = await confirmDialog(t('dialogs.backup.restoreConfirm'), {
            title: t('dialogs.backup.restoreConfirmTitle'),
            confirmLabel: t('dialogs.backup.restore')
        });
        if (!ok) return;
        runQueued(
            (requestId) => window.api.backup.restoreExternal({targetConnId: connection.connId, requestId}),
            `${t('dialogs.backup.restoreExternal')}: ${connection.connLabel}`
        );
    }

    async function handleDelete(backup) {
        const ok = await confirmDialog(t('dialogs.backup.deleteConfirm'), {
            title: t('dialogs.backup.deleteConfirmTitle'),
            confirmLabel: t('dialogs.common.delete')
        });
        if (!ok) return;
        try {
            await window.api.backup.deleteInternal({id: backup.id});
            loadBackups();
        } catch (err) {
            reportError(err.message, 'Delete backup');
        }
    }

    return createPortal(
        <div className={`modal-backdrop ${closing ? 'is-closing' : ''}`} onClick={() => requestClose()}>
            <div className="modal wide" onClick={(e) => e.stopPropagation()}>
                <h3>{t('dialogs.backup.title')}</h3>

                <div className="backup-tabs">
                    <button className={`backup-tab ${tab === 'create' ? 'is-active' : ''}`}
                            onClick={() => setTab('create')}>
                        {t('dialogs.backup.createTab')}
                    </button>
                    <button className={`backup-tab ${tab === 'manage' ? 'is-active' : ''}`}
                            onClick={() => setTab('manage')}>
                        {t('dialogs.backup.manageTab')}
                    </button>
                </div>

                {tab === 'create' && (
                    <div className="backup-create-actions">
                        <div className="sql-export-field-list-header sql-export-field-list-header--titled">
                            <label className="sql-export-field-list-title">{t('dialogs.backup.collections')}</label>
                        </div>
                        {loadingDbTree ? (
                            <div className="backup-db-tree">
                                {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton-row"/>)}
                            </div>
                        ) : (
                            <div className="backup-db-tree">
                                {dbTree.map((db) => {
                                    const selected = selection[db.name] || new Set();
                                    const isCollapsed = collapsed.has(db.name);
                                    return (
                                        <div key={db.name} className="backup-db-group">
                                            <div className="backup-db-header">
                                                <button className="backup-db-collapse" onClick={() => toggleCollapsed(db.name)}>
                                                    <i className={`fa-solid fa-chevron-right backup-db-chevron ${isCollapsed ? '' : 'is-open'}`}/>
                                                </button>
                                                <label className="sql-export-field-row backup-db-name-row">
                                                    <input type="checkbox"
                                                           checked={db.collections.length > 0 && selected.size === db.collections.length}
                                                           ref={(el) => { if (el) el.indeterminate = selected.size > 0 && selected.size < db.collections.length; }}
                                                           onChange={() => toggleDb(db.name)}/>
                                                    <span className="sql-export-field-row-name">{db.name}</span>
                                                    <span className="sql-export-field-row-count">{selected.size}/{db.collections.length}</span>
                                                </label>
                                            </div>
                                            {!isCollapsed && (
                                                <div className="sql-export-field-list backup-db-collections">
                                                    {db.collections.map((c) => (
                                                        <label key={c.name} className="sql-export-field-row">
                                                            <input type="checkbox" checked={selected.has(c.name)}
                                                                   onChange={() => toggleCollection(db.name, c.name)}/>
                                                            <span className="sql-export-field-row-name">{c.name}</span>
                                                            <span className="sql-export-field-row-count">{formatCount(c.count)}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {!loadingDbTree && selectedCollectionCount() === 0 &&
                            <div className="error-banner">{t('dialogs.backup.noCollectionsSelected')}</div>}

                        <button className="primary" onClick={handleCreateInternal} disabled={loadingDbTree || selectedCollectionCount() === 0}>
                            <i className="fa-solid fa-floppy-disk"/> {t('dialogs.backup.createInternal')}
                        </button>
                        <button onClick={handleCreateExternal} disabled={loadingDbTree || selectedCollectionCount() === 0}>
                            <i className="fa-solid fa-file-zipper"/> {t('dialogs.backup.createExternal')}
                        </button>
                        <button onClick={handleRestoreExternal}>
                            <i className="fa-solid fa-file-import"/> {t('dialogs.backup.restoreExternal')}
                        </button>
                    </div>
                )}

                {tab === 'manage' && (
                    <div className="backup-list">
                        {backups === null && <p className="hint-text">…</p>}
                        {backups && backups.length === 0 &&
                            <p className="hint-text">{t('dialogs.backup.noBackups')}</p>}
                        {backups && backups.map((b) => (
                            <div key={b.id} className="backup-list-item">
                                <div className="backup-list-item-main">
                                    <div
                                        className="backup-list-item-date">{new Date(b.createdAt).toLocaleString()}</div>
                                    <div className="backup-list-item-dbs">
                                        {t('dialogs.backup.databases')}: {b.databases.map((d) => d.name).join(', ') || '—'}
                                    </div>
                                </div>
                                <div className="backup-list-item-actions">
                                    <button className="tiny-btn" onClick={() => handleRestore(b)}>
                                        {t('dialogs.backup.restore')}
                                    </button>
                                    <button className="tiny-btn tiny-btn-danger-outline"
                                            onClick={() => handleDelete(b)}>
                                        {t('dialogs.common.delete')}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="modal-actions">
                    <div className="spacer"/>
                    <button onClick={() => requestClose()}>{t('dialogs.common.close')}</button>
                </div>
            </div>
        </div>,
        document.body
    );
}