import React, {useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import {useTranslation} from 'react-i18next';
import {useClosing} from '../lib/useClosing.js';
import {useConfirm} from './ConfirmProvider.jsx';
import {reportError} from '../lib/errorBus.js';
import {useTaskQueue} from './TaskQueueProvider.jsx';

export default function BackupDialog({connection, onClose}) {
    const {t} = useTranslation();
    const confirmDialog = useConfirm();
    const {enqueue, updateTaskProgress} = useTaskQueue();
    const {closing, requestClose} = useClosing(onClose);
    const [tab, setTab] = useState('create');
    const [backups, setBackups] = useState(null);

    function loadBackups() {
        window.api.backup.listInternal().then((list) => {
            setBackups((list || []).filter((b) => b.connId === connection.connId));
        }).catch((err) => reportError(err.message, 'List backups'));
    }

    useEffect(() => {
        if (tab === 'manage') loadBackups();
    }, [tab]);

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
        runQueued(
            (requestId) => window.api.backup.createInternal({
                connId: connection.connId,
                connLabel: connection.connLabel,
                requestId
            }),
            `${t('dialogs.backup.createInternal')}: ${connection.connLabel}`
        );
    }

    function handleCreateExternal() {
        runQueued(
            (requestId) => window.api.backup.createExternal({
                connId: connection.connId,
                connLabel: connection.connLabel,
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

                <p className="hint-text">{t('dialogs.backup.excludedNote')}</p>

                {tab === 'create' && (
                    <div className="backup-create-actions">
                        <button className="primary" onClick={handleCreateInternal}>
                            <i className="fa-solid fa-floppy-disk"/> {t('dialogs.backup.createInternal')}
                        </button>
                        <button onClick={handleCreateExternal}>
                            <i className="fa-solid fa-file-zipper"/> {t('dialogs.backup.createExternal')}
                        </button>
                        <button onClick={handleRestoreExternal}>
                            <i className="fa-solid fa-file-import"/> {t('dialogs.backup.restoreExternal')}
                        </button>
                        <p className="hint-text">{t('dialogs.backup.queuedNote')}</p>
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