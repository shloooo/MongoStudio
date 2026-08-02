import React, {useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {EJSON} from 'bson';
import {useConfirm} from './ConfirmProvider.jsx';
import {reportError} from '../lib/errorBus.js';
import Select from './Select.jsx';

function formatBytes(bytes) {
    if (bytes === undefined || bytes === null) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = Number(bytes);
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex++;
    }
    return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export default function GridFSBrowser({selection}) {
    const {t} = useTranslation();
    const confirmDialog = useConfirm();
    const [buckets, setBuckets] = useState(null);
    const [activeBucket, setActiveBucket] = useState(null);
    const [files, setFiles] = useState(null);
    const [loadingFiles, setLoadingFiles] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [downloadingId, setDownloadingId] = useState(null);
    const [showNewBucket, setShowNewBucket] = useState(false);
    const [newBucketName, setNewBucketName] = useState('fs');

    async function loadBuckets(selectBucket) {
        const result = await window.api.data.gridfsListBuckets({
            connId: selection.connId,
            dbName: selection.dbName
        });
        setBuckets(result || []);
        if (selectBucket) {
            setActiveBucket(selectBucket);
        } else if (!activeBucket && result && result.length > 0) {
            setActiveBucket(result[0]);
        }
    }

    useEffect(() => {
        loadBuckets();
    }, [selection.connId, selection.dbName]);

    async function loadFiles(bucketName) {
        if (!bucketName) return;
        setLoadingFiles(true);
        try {
            const result = await window.api.data.gridfsListFiles({
                connId: selection.connId,
                dbName: selection.dbName,
                bucketName
            });
            setFiles((result || []).map((f) => EJSON.deserialize(f)));
        } catch (err) {
            reportError(err.message, 'Load GridFS files');
        } finally {
            setLoadingFiles(false);
        }
    }

    useEffect(() => {
        if (activeBucket) loadFiles(activeBucket);
    }, [activeBucket]);

    async function handleCreateBucket() {
        const name = newBucketName.trim();
        if (!name) return;
        try {
            await window.api.data.gridfsCreateBucket({connId: selection.connId, dbName: selection.dbName, bucketName: name});
            setShowNewBucket(false);
            setNewBucketName('fs');
            await loadBuckets(name);
        } catch (err) {
            reportError(err.message, 'Create GridFS bucket');
        }
    }

    async function handleDropBucket() {
        if (!activeBucket) return;
        const ok = await confirmDialog(t('gridfs.dropBucketConfirm', {name: activeBucket}), {
            title: t('gridfs.dropBucketConfirmTitle'),
            confirmLabel: t('dialogs.common.delete')
        });
        if (!ok) return;
        try {
            await window.api.data.gridfsDropBucket({connId: selection.connId, dbName: selection.dbName, bucketName: activeBucket});
            setActiveBucket(null);
            setFiles(null);
            await loadBuckets();
        } catch (err) {
            reportError(err.message, 'Delete GridFS bucket');
        }
    }

    async function handleUpload() {
        if (!activeBucket) return;
        setUploading(true);
        try {
            const result = await window.api.data.gridfsUpload({
                connId: selection.connId,
                dbName: selection.dbName,
                bucketName: activeBucket
            });
            if (result.ok) await loadFiles(activeBucket);
        } catch (err) {
            reportError(err.message, 'Upload file');
        } finally {
            setUploading(false);
        }
    }

    async function handleDownload(file) {
        const id = EJSON.stringify(file._id);
        setDownloadingId(file._id.toString ? file._id.toString() : String(file._id));
        try {
            await window.api.data.gridfsDownload({
                connId: selection.connId,
                dbName: selection.dbName,
                bucketName: activeBucket,
                fileId: id,
                filename: file.filename
            });
        } catch (err) {
            reportError(err.message, 'Download file');
        } finally {
            setDownloadingId(null);
        }
    }

    async function handleDelete(file) {
        const ok = await confirmDialog(t('gridfs.deleteConfirm', {name: file.filename}), {
            title: t('gridfs.deleteConfirmTitle'),
            confirmLabel: t('dialogs.common.delete')
        });
        if (!ok) return;
        try {
            await window.api.data.gridfsDelete({
                connId: selection.connId,
                dbName: selection.dbName,
                bucketName: activeBucket,
                fileId: EJSON.stringify(file._id)
            });
            await loadFiles(activeBucket);
        } catch (err) {
            reportError(err.message, 'Delete file');
        }
    }

    return (
        <div className="gridfs-browser">
            <div className="gridfs-toolbar">
                <Select
                    className="gridfs-bucket-select"
                    value={activeBucket || ''}
                    onChange={setActiveBucket}
                    disabled={!buckets || buckets.length === 0}
                    placeholder={t('gridfs.noBuckets')}
                    options={(buckets || []).map((b) => ({value: b, label: b}))}
                />
                <button onClick={() => setShowNewBucket((v) => !v)}>{t('gridfs.newBucket')}</button>
                <button onClick={handleDropBucket} disabled={!activeBucket} className="tiny-btn-danger-outline">
                    {t('gridfs.deleteBucket')}
                </button>
                <button onClick={handleUpload} disabled={!activeBucket || uploading} className="primary">
                    {uploading ? t('gridfs.uploading') : t('gridfs.upload')}
                </button>
                <div className="spacer"/>
                <button onClick={() => loadFiles(activeBucket)} disabled={!activeBucket}>{t('sidebar.refresh')}</button>
            </div>

            {showNewBucket && (
                <div className="gridfs-new-bucket-row">
                    <input
                        value={newBucketName}
                        onChange={(e) => setNewBucketName(e.target.value)}
                        placeholder="fs"
                    />
                    <button onClick={handleCreateBucket} className="primary">{t('dialogs.common.create')}</button>
                    <button onClick={() => setShowNewBucket(false)}>{t('dialogs.common.cancel')}</button>
                </div>
            )}

            <div className="gridfs-files-wrap">
                {!activeBucket && <div className="hint-text">{t('gridfs.selectBucketHint')}</div>}
                {activeBucket && loadingFiles && <div className="hint-text">…</div>}
                {activeBucket && !loadingFiles && files && files.length === 0 && (
                    <div className="hint-text">{t('gridfs.noFiles')}</div>
                )}
                {activeBucket && !loadingFiles && files && files.length > 0 && (
                    <table className="gridfs-table">
                        <thead>
                        <tr>
                            <th>{t('gridfs.filename')}</th>
                            <th>{t('gridfs.size')}</th>
                            <th>{t('gridfs.uploadDate')}</th>
                            <th>{t('gridfs.contentType')}</th>
                            <th/>
                        </tr>
                        </thead>
                        <tbody>
                        {files.map((f) => {
                            const idStr = f._id && f._id.toString ? f._id.toString() : String(f._id);
                            return (
                                <tr key={idStr}>
                                    <td className="gridfs-filename-cell">{f.filename}</td>
                                    <td>{formatBytes(f.length)}</td>
                                    <td>{f.uploadDate ? new Date(f.uploadDate).toLocaleString() : '—'}</td>
                                    <td>{f.contentType || f.metadata?.contentType || '—'}</td>
                                    <td className="gridfs-actions-cell">
                                        <button className="tiny-btn" disabled={downloadingId === idStr} onClick={() => handleDownload(f)}>
                                            {downloadingId === idStr ? '…' : t('gridfs.download')}
                                        </button>
                                        <button className="tiny-btn tiny-btn-danger-outline" onClick={() => handleDelete(f)}>
                                            {t('dialogs.common.delete')}
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}