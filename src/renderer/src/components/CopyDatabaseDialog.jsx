import React, { useState } from 'react';

export default function CopyDatabaseDialog({ source, openConnections, onClose, onCopied }) {
    const [targetConnId, setTargetConnId] = useState('');
    const [targetDb, setTargetDb] = useState(source.dbName);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);

    async function handleCopy() {
        if (!targetConnId || !targetDb) {
            setError('Choose a target connection and database name.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            const res = await window.api.data.copyDatabase({
                sourceConnId: source.connId,
                sourceDb: source.dbName,
                targetConnId,
                targetDb
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
                <h3>Copy Database</h3>
                <p className="hint-text">
                    Copy all collections and documents from <strong>{source.dbName}</strong> to another connection.
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

                        <label>Target database name</label>
                        <input value={targetDb} onChange={(e) => setTargetDb(e.target.value)} />
                    </>
                )}

                {error && <div className="error-banner">{error}</div>}
                {result && result.ok && (
                    <div className="info-banner">
                        Copied {result.copiedCount} document(s) across {result.collectionCount} collection(s).
                    </div>
                )}

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