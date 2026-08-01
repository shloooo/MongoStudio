import React, {useEffect, useRef, useState} from 'react';
import {Trans, useTranslation} from 'react-i18next';
import {useClosing} from '../lib/useClosing.js';
import {useTaskQueue} from './TaskQueueProvider.jsx';

export default function CopyCollectionDialog({ source, openConnections, onClose, onCopied }) {
  const { t } = useTranslation();
  const { closing, requestClose } = useClosing(onClose);
  const {enqueue, updateTaskProgress} = useTaskQueue();
  const [targetConnId, setTargetConnId] = useState('');
  const [targetDbs, setTargetDbs] = useState([]);
  const [targetDb, setTargetDb] = useState('');
  const [targetCollection, setTargetCollection] = useState(source.collection);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(null); // { copiedCount, totalInCollection }
  const requestIdRef = useRef(null);
  const taskIdRef = useRef(null);

  useEffect(() => {
    if (!targetConnId) { setTargetDbs([]); return; }
    window.api.conn.listDatabases(targetConnId).then((dbs) => {
      const sorted = [...dbs].sort((a, b) => a.name.localeCompare(b.name));
      setTargetDbs(sorted);
      if (sorted.length && !sorted.some((d) => d.name === targetDb)) setTargetDb(sorted[0].name);
    });
  }, [targetConnId]);

  useEffect(() => {
    const unsubscribe = window.api.data.onCopyProgress((payload) => {
      if (!requestIdRef.current || payload.requestId !== requestIdRef.current) return;
      if (payload.phase === 'start' || payload.phase === 'progress' || payload.phase === 'done') {
        const next = {copiedCount: payload.copiedCount || 0, totalInCollection: payload.totalInCollection || 0};
        setProgress(next);
        if (taskIdRef.current && next.totalInCollection) {
          updateTaskProgress(taskIdRef.current, {percent: Math.min(100, (next.copiedCount / next.totalInCollection) * 100)});
        }
      }
    });
    return unsubscribe;
  }, []);

  function startCopy() {
    if (!targetConnId || !targetDb || !targetCollection) {
      setError(t('dialogs.copyCollection.chooseTarget'));
      return null;
    }
    setError('');
    setProgress({ copiedCount: 0, totalInCollection: 0 });
    const requestId = crypto.randomUUID();
    requestIdRef.current = requestId;
    return window.api.data.copyCollection({
      sourceConnId: source.connId,
      sourceDb: source.dbName,
      sourceCollection: source.collection,
      targetConnId,
      targetDb,
      targetCollection,
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
    const label = t('dialogs.copyCollection.taskLabel', {
      collection: source.collection,
      target: targetCollection
    });
    taskIdRef.current = enqueue(task, label, {
      onDone: () => {
        if (onCopied) onCopied();
      }
    });
    requestClose();
  }

  const otherConnections = openConnections.filter((c) => c.id !== source.connId);
  const percent = progress && progress.totalInCollection
      ? Math.min(100, (progress.copiedCount / progress.totalInCollection) * 100)
      : (busy ? 100 : 0);

  return (
      <div className={`modal-backdrop ${closing ? 'is-closing' : ''}`} onClick={() => requestClose()}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3>{t('dialogs.copyCollection.title')}</h3>
          <p className="hint-text">
            <Trans i18nKey="dialogs.copyCollection.description"
                   values={{path: `${source.dbName}.${source.collection}`}}
                   components={{bold: <strong/>}}/>
          </p>

          {otherConnections.length === 0 ? (
              <div className="error-banner">{t('dialogs.copyCollection.noOtherConnections')}</div>
          ) : (
              <>
                <label>{t('dialogs.copyCollection.targetConnection')}</label>
                <select value={targetConnId} onChange={(e) => setTargetConnId(e.target.value)} disabled={busy}>
                  <option value="">{t('dialogs.copyCollection.selectConnection')}</option>
                  {otherConnections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>

                {targetConnId && (
                    <>
                      <label>{t('dialogs.copyCollection.targetDatabase')}</label>
                      <select value={targetDb} onChange={(e) => setTargetDb(e.target.value)} disabled={busy}>
                        {targetDbs.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
                      </select>

                      <label>{t('dialogs.copyCollection.targetCollectionName')}</label>
                      <input value={targetCollection} onChange={(e) => setTargetCollection(e.target.value)} disabled={busy} />
                    </>
                )}
              </>
          )}

          {(busy || (result && result.ok)) && progress && (
              <div className="update-progress">
                <div className="update-progress-bar-track">
                  <div className="update-progress-bar-fill" style={{ width: `${percent}%` }} />
                </div>
                <div className="update-progress-meta">
                  <span>{busy ? t('dialogs.copyCollection.copying') : t('dialogs.copyCollection.done')}</span>
                  <span>
                {t('dialogs.copyCollection.documentCount', {count: progress.copiedCount})}{progress.totalInCollection ? ` / ${progress.totalInCollection}` : ''}
              </span>
                </div>
              </div>
          )}

          {error && <div className="error-banner">{error}</div>}
          {result && result.ok && <div className="info-banner">{t('dialogs.copyCollection.copySuccess', {count: result.copiedCount})}</div>}

          <div className="modal-actions">
            <div className="spacer" />
            <button onClick={() => requestClose()} disabled={busy}>{result ? t('dialogs.common.close') : t('dialogs.common.cancel')}</button>
            {!result && (
                <>
                  <button onClick={handleCopyInBackground} disabled={busy || otherConnections.length === 0}>
                    {t('dialogs.copyCollection.copyInBackground')}
                  </button>
                  <button className="primary" onClick={handleCopy} disabled={busy || otherConnections.length === 0}>
                    {busy ? t('dialogs.copyCollection.copying') : t('dialogs.copyCollection.copy')}
                  </button>
                </>
            )}
          </div>
        </div>
      </div>
  );
}