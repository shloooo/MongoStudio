import React, { useState, useEffect } from 'react';

export default function CopyCollectionDialog({ source, openConnections, onClose, onCopied }) {
  const [targetConnId, setTargetConnId] = useState('');
  const [targetDbs, setTargetDbs] = useState([]);
  const [targetDb, setTargetDb] = useState('');
  const [targetCollection, setTargetCollection] = useState(source.collection);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!targetConnId) { setTargetDbs([]); return; }
    window.api.conn.listDatabases(targetConnId).then((dbs) => {
      const sorted = [...dbs].sort((a, b) => a.name.localeCompare(b.name));
      setTargetDbs(sorted);
      if (sorted.length && !sorted.some((d) => d.name === targetDb)) setTargetDb(sorted[0].name);
    });
  }, [targetConnId]);

  async function handleCopy() {
    if (!targetConnId || !targetDb || !targetCollection) {
      setError('Choose a target connection, database, and collection name.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await window.api.data.copyCollection({
        sourceConnId: source.connId,
        sourceDb: source.dbName,
        sourceCollection: source.collection,
        targetConnId,
        targetDb,
        targetCollection
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
            <select value={targetConnId} onChange={(e) => setTargetConnId(e.target.value)}>
              <option value="">Select a connection...</option>
              {otherConnections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            {targetConnId && (
              <>
                <label>Target database</label>
                <select value={targetDb} onChange={(e) => setTargetDb(e.target.value)}>
                  {targetDbs.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
                </select>

                <label>Target collection name</label>
                <input value={targetCollection} onChange={(e) => setTargetCollection(e.target.value)} />
              </>
            )}
          </>
        )}

        {error && <div className="error-banner">{error}</div>}
        {result && result.ok && <div className="info-banner">Copied {result.copiedCount} document(s).</div>}

        <div className="modal-actions">
          <div className="spacer" />
          <button onClick={onClose}>{result ? 'Close' : 'Cancel'}</button>
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
