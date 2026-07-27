import React, { useState, useEffect, useRef } from 'react';

export default function CopyDatabaseDialog({ source, openConnections, onClose, onCopied }) {
    const [targetConnId, setTargetConnId] = useState('');
    const [targetDb, setTargetDb] = useState(source.dbName);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);
    const [queue, setQueue] = useState([]); // [{ name, status: 'pending'|'active'|'done', copied, total }]
    const [overallCopied, setOverallCopied] = useState(0);
    const requestIdRef = useRef(null);

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
                    if (payload.copiedCount !== undefined) setOverallCopied(payload.copiedCount);
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

    async function handleCopy() {
        if (!targetConnId || !targetDb) {
            setError('Choose a target connection and database name.');
            return;
        }
        setBusy(true);
        setError('');
        setQueue([]);
        setOverallCopied(0);
        const requestId = crypto.randomUUID();
        requestIdRef.current = requestId;
        try {
            const res = await window.api.data.copyDatabase({
                sourceConnId: source.connId,
                sourceDb: source.dbName,
                targetConnId,
                targetDb,
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
    const doneCount = queue.filter((item) => item.status === 'done').length;

    function statusLabel(item) {
        if (item.status === 'done') return `done (${item.copied})`;
        if (item.status === 'active') return item.total ? `${item.copied} / ${item.total}` : 'copying...';
        return 'pending';
    }

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
                        <select value={targetConnId} onChange={(e) => setTargetConnId(e.target.value)} disabled={busy}>
                            <option value="">Select a connection...</option>
                            {otherConnections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>

                        <label>Target database name</label>
                        <input value={targetDb} onChange={(e) => setTargetDb(e.target.value)} disabled={busy} />
                    </>
                )}

                {queue.length > 0 && (
                    <>
                        <label>Queue ({doneCount}/{queue.length} collections)</label>
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
                                            <div
                                                className="update-progress-bar-fill"
                                                style={{ width: `${Math.min(100, (item.copied / item.total) * 100)}%` }}
                                            />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="copy-queue-summary">{overallCopied} document(s) copied so far</div>
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