import React, { useState, useEffect, useCallback } from 'react';
import { EJSON } from 'bson';
import { parseShell } from '../lib/shellSyntax.js';

export default function IndexesTab({ selection, reloadSignal }) {
  const [indexes, setIndexes] = useState([]);
  const [spec, setSpec] = useState('{field: 1}');
  const [options, setOptions] = useState('{unique: false}');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const idx = await window.api.data.indexes({
      connId: selection.connId,
      dbName: selection.dbName,
      collection: selection.collection
    });
    setIndexes(idx);
  }, [selection]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (reloadSignal !== undefined && reloadSignal > 0) load(); }, [reloadSignal]);

  async function handleCreate() {
    setError('');
    try {
      const specValue = parseShell(spec);
      const optionsValue = parseShell(options);
      await window.api.data.createIndex({
        connId: selection.connId,
        dbName: selection.dbName,
        collection: selection.collection,
        spec: EJSON.stringify(specValue),
        options: EJSON.stringify(optionsValue)
      });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="indexes-tab">
      <table className="doc-table">
        <thead><tr><th>Name</th><th>Keys</th><th>Options</th></tr></thead>
        <tbody>
          {indexes.map((idx) => (
            <tr key={idx.name}>
              <td>{idx.name}</td>
              <td><code>{JSON.stringify(idx.key)}</code></td>
              <td>{idx.unique ? 'unique' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="new-index-form">
        <h4>Create New Index</h4>
        <div className="row">
          <div>
            <label>Keys</label>
            <input value={spec} onChange={(e) => setSpec(e.target.value)} />
          </div>
          <div>
            <label>Options</label>
            <input value={options} onChange={(e) => setOptions(e.target.value)} />
          </div>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <button className="primary" onClick={handleCreate}>Create Index</button>
      </div>
    </div>
  );
}
