import React, { useState, useEffect, useRef } from 'react';

export default function CopyCollectionDialog({ source, openConnections, onClose, onCopied }) {
  const [targetConnId, setTargetConnId] = useState('');
  const [targetDbs, setTargetDbs] = useState([]);
  const [targetDb, setTargetDb] = useState('');
  const [targetCollection, setTargetCollection] = useState(source.collection);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(null); // { copiedCount, totalInCollection }
  const requestIdRef = useRef(null);

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
        setProgress({ copiedCount: payload.copiedCount || 0, totalInCollection: payload.totalInCollection || 0 });
      }
    });
    return unsubscribe;
  }, []);

  async function handleCopy() {
    if (!targetConnId || !targetDb || !targetCollection) {
      setError('Choose a target connection, database, and collection name.');
      return;
    }
    setBusy(true);
    setError('');
    setProgress({ copiedCount: 0, totalInCollection: 0 });
    const requestId = crypto.randomUUID();
    requestIdRef.current = requestId;
    try {
      const res = await window.api.data.copyCollection({
        sourceConnId: source.connId,
        sourceDb: source.dbName,
        sourceCollection: source.collection,
        targetConnId,
        targetDb,
        targetCollection,
        requestId
      });
      setResult(res);
      if (onCopied) onCopied();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const otherConnections = openConnections.filter((c) => c.id !== source.connId);
  const percent = progress && progress.totalInCollection
      ? Math.min(100, (progress.copiedCount / progress.totalInCollection) * 100)
      : (busy ? 100 : 0);

  return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3>Copy Collection</h3>
          <p className="hint-text">
            Copy all documents from <strong>{source.dbName}.{source.collection}</strong> to another connection.
          </p>

          {otherConnections.length === 0 ? (
              <div className="error-banner">No other open connections. Connect to another database first.</div>
          ) : (
              <>
                <label>Target connection</label>
                <select value={targetConnId} onChange={(e) => setTargetConnId(e.target.value)} disabled={busy}>
                  <option value="">Select a connection...</option>
                  {otherConnections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>

                {targetConnId && (
                    <>
                      <label>Target database</label>
                      <select value={targetDb} onChange={(e) => setTargetDb(e.target.value)} disabled={busy}>
                        {targetDbs.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
                      </select>

                      <label>Target collection name</label>
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
                  <span>{busy ? 'Copying...' : 'Done'}</span>
                  <span>
                {progress.copiedCount}{progress.totalInCollection ? ` / ${progress.totalInCollection}` : ''} document(s)
              </span>
                </div>
              </div>
          )}

          {error && <div className="error-banner">{error}</div>}
          {result && result.ok && <div className="info-banner">Copied {result.copiedCount} document(s).</div>}

          <div className="modal-actions">
            <div className="spacer" />
            <button onClick={onClose} disabled={busy}>{result ? 'Close' : 'Cancel'}</button>
            {!result && (
                <button className="primary" onClick={handleCopy} disabled={busy || otherConnections.length === 0}>
                  {busy ? 'Copying...' : 'Copy'}
                </button>
            )}
          </div>
        </div>
      </div>
  );
}