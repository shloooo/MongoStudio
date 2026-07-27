import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { EJSON } from 'bson';
import { parseShell } from '../lib/shellSyntax.js';
import { bsonTypeOf, shortLabel, FIELD_TYPES, coerceToType, toEditableRaw } from '../lib/bsonTypes.js';
import DocumentEditor from './DocumentEditor.jsx';

const PAGE_SIZE = 50;

function idScalar(oid) {
  const type = bsonTypeOf(oid);
  if (type === 'ObjectId') return oid.toHexString();
  if (type === 'UUID') return oid.toString();
  return String(oid);
}

function CellValue({ value }) {
  const type = bsonTypeOf(value);
  if (type === 'DBRef') {
    const ns = value.db ? `${value.db}.${value.collection}` : value.collection;
    return <>{idScalar(value.oid)} <span className="dbref-ns">@ {ns}</span></>;
  }
  const label = shortLabel(value);
  return <>{label.length > 80 ? label.slice(0, 80) + '…' : label}</>;
}

const NON_INLINE_EDITABLE_TYPES = ['Object', 'Array', 'DBRef', 'Binary'];

function isInlineEditable(value) {
  return !NON_INLINE_EDITABLE_TYPES.includes(bsonTypeOf(value));
}

function InlineCellEditor({ value, onCommit, onCancel }) {
  const initialType = bsonTypeOf(value) === 'Undefined' ? 'String' : bsonTypeOf(value);
  const [type, setType] = useState(initialType);
  const [raw, setRaw] = useState(() => toEditableRaw(value));
  const [error, setError] = useState('');
  const containerRef = React.useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onCancel();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onCancel]);

  function commit() {
    try {
      onCommit(coerceToType(raw, type));
    } catch (err) {
      setError(err.message);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  }

  return (
    <span className="inline-value-editor cell-editor" ref={containerRef}>
      <select className="type-badge type-badge-select" value={type} onChange={(e) => setType(e.target.value)}>
        {FIELD_TYPES.filter((t) => t !== 'Object' && t !== 'Array' && t !== 'DBRef' && t !== 'Binary').map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      {type === 'Boolean' ? (
        <select className="inline-input" autoFocus value={raw} onChange={(e) => setRaw(e.target.value)} onKeyDown={handleKeyDown}>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : type === 'Null' ? (
        <span className="inline-input inline-input-static">null</span>
      ) : (
        <input className="inline-input" autoFocus value={raw}
          onChange={(e) => { setRaw(e.target.value); setError(''); }} onKeyDown={handleKeyDown} />
      )}
      <button className="tiny-btn" onMouseDown={(e) => e.preventDefault()} onClick={commit}>✓</button>
      <button className="tiny-btn" onMouseDown={(e) => e.preventDefault()} onClick={onCancel}>✕</button>
      {error && <span className="inline-error">{error}</span>}
    </span>
  );
}

export default function DocumentsTab({ selection, reloadSignal }) {
  const [filter, setFilter] = useState('{}');
  const [sort, setSort] = useState('{_id: -1}');
  const [docs, setDocs] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [modalDoc, setModalDoc] = useState(null); // null | 'new' | doc-object
  const [editingCell, setEditingCell] = useState(null); // { rowIndex, field } | null
  const [selectedIds, setSelectedIds] = useState(new Set());

  const runQuery = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const filterValue = parseShell(filter || '{}');
      const sortValue = parseShell(sort || '{}');
      const result = await window.api.data.find({
        connId: selection.connId,
        dbName: selection.dbName,
        collection: selection.collection,
        filter: EJSON.stringify(filterValue),
        sort: EJSON.stringify(sortValue),
        limit: PAGE_SIZE,
        skip: page * PAGE_SIZE
      });
      setDocs(result.docs.map((d) => EJSON.parse(JSON.stringify(d), { relaxed: false })));
      setTotalCount(result.totalCount);
      setSelectedIds(new Set());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selection, filter, sort, page]);

  useEffect(() => { runQuery(); }, [selection, page]);
  useEffect(() => { if (reloadSignal !== undefined) runQuery(); }, [reloadSignal]);

  // Union of field names across the loaded page, in first-seen order, _id always first.
  const fieldColumns = useMemo(() => {
    const seen = new Set();
    const cols = [];
    for (const doc of docs) {
      for (const key of Object.keys(doc)) {
        if (key === '_id' || seen.has(key)) continue;
        seen.add(key);
        cols.push(key);
      }
    }
    return cols;
  }, [docs]);

  function handleRunClick() {
    setPage(0);
    runQuery();
  }

  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} document(s)?`)) return;
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await window.api.data.deleteOne({
        connId: selection.connId,
        dbName: selection.dbName,
        collection: selection.collection,
        filter: EJSON.stringify({ _id: id.value })
      });
    }
    runQuery();
  }

  async function persistFieldUpdate(doc, field, newValue) {
    const idFilter = EJSON.stringify({ _id: doc._id });
    const update = newValue === undefined
      ? { $unset: { [field]: '' } }
      : { $set: { [field]: newValue } };
    await window.api.data.updateOne({
      connId: selection.connId,
      dbName: selection.dbName,
      collection: selection.collection,
      filter: idFilter,
      update: EJSON.stringify(update)
    });
  }

  async function handleCellCommit(rowIndex, field, newValue) {
    const doc = docs[rowIndex];
    await persistFieldUpdate(doc, field, newValue);
    setDocs((prev) => {
      const next = [...prev];
      next[rowIndex] = { ...next[rowIndex], [field]: newValue };
      return next;
    });
    setEditingCell(null);
  }

  async function handleSaveModalDoc(value, isNew) {
    if (isNew) {
      await window.api.data.insertOne({
        connId: selection.connId,
        dbName: selection.dbName,
        collection: selection.collection,
        doc: EJSON.stringify(value)
      });
    } else {
      const idFilter = EJSON.stringify({ _id: value._id });
      const update = { ...value };
      delete update._id;
      await window.api.data.updateOne({
        connId: selection.connId,
        dbName: selection.dbName,
        collection: selection.collection,
        filter: idFilter,
        update: EJSON.stringify({ $set: update })
      });
    }
    setModalDoc(null);
    runQuery();
  }

  async function handleExport(format) {
    await window.api.data.exportResults({
      docs,
      format,
      suggestedName: `${selection.collection}.${format}`
    });
  }

  async function handleImport() {
    const result = await window.api.data.importFile({
      connId: selection.connId,
      dbName: selection.dbName,
      collection: selection.collection
    });
    if (result.ok) runQuery();
  }

  function toggleSelect(rawDoc) {
    const key = JSON.stringify(rawDoc._id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const existing = Array.from(next).find((e) => e.key === key);
      if (existing) next.delete(existing);
      else next.add({ key, value: rawDoc._id });
      return next;
    });
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="documents-tab">
      <div className="query-bar">
        <div className="query-field">
          <label>Filter</label>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder='{name: "value"} or {_id: ObjectId("...")}' />
        </div>
        <div className="query-field">
          <label>Sort</label>
          <input value={sort} onChange={(e) => setSort(e.target.value)} placeholder='{_id: -1}' />
        </div>
        <button className="primary" onClick={handleRunClick} disabled={loading}>{loading ? '...' : 'Run'}</button>
      </div>

      <div className="toolbar">
        <button onClick={() => setModalDoc('new')}>+ New Document</button>
        <button onClick={handleDeleteSelected} disabled={selectedIds.size === 0}>Delete ({selectedIds.size})</button>
        <div className="spacer" />
        <button onClick={handleImport}>Import</button>
        <button onClick={() => handleExport('json')}>Export JSON</button>
        <button onClick={() => handleExport('csv')}>Export CSV</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="results-area">
        <table className="doc-table spreadsheet-table">
          <thead>
            <tr>
              <th className="col-checkbox"></th>
              <th className="col-id">_id</th>
              {fieldColumns.map((f) => <th key={f}>{f}</th>)}
              <th className="col-fill"></th>
              <th className="col-expand"></th>
            </tr>
          </thead>
          <tbody>
            {docs.map((doc, rowIndex) => (
              <tr key={rowIndex}>
                <td className="col-checkbox">
                  <input
                    type="checkbox"
                    onChange={() => toggleSelect(doc)}
                    checked={Array.from(selectedIds).some((s) => s.key === JSON.stringify(doc._id))}
                  />
                </td>
                <td className="id-cell col-id">{idScalar(doc._id) === String(doc._id) ? String(doc._id) : idScalar(doc._id)}</td>
                {fieldColumns.map((field) => {
                  const isEditing = editingCell && editingCell.rowIndex === rowIndex && editingCell.field === field;
                  const hasValue = Object.prototype.hasOwnProperty.call(doc, field);
                  const editable = hasValue && isInlineEditable(doc[field]);
                  return (
                    <td key={field} className="spreadsheet-cell">
                      {isEditing ? (
                        <InlineCellEditor
                          value={doc[field]}
                          onCommit={(v) => handleCellCommit(rowIndex, field, v)}
                          onCancel={() => setEditingCell(null)}
                        />
                      ) : (
                        <span
                          className={`cell-value-trigger ${editable ? '' : 'not-editable'}`}
                          onClick={() => { if (editable) setEditingCell({ rowIndex, field }); }}
                          title={!hasValue ? '' : editable ? '' : 'Open the full document editor (⤢) to edit this value'}
                        >
                          {hasValue ? <CellValue value={doc[field]} /> : <span className="cell-empty">—</span>}
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="col-fill"></td>
                <td className="col-expand">
                  <button className="tiny-btn" onClick={() => setModalDoc(doc)} title="Open full document editor">⤢</button>
                </td>
              </tr>
            ))}
            {docs.length === 0 && !loading && (
              <tr><td colSpan={fieldColumns.length + 4} className="tree-empty">No documents found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Back</button>
        <span>Page {page + 1} / {totalPages} ({totalCount} documents)</span>
        <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next →</button>
      </div>

      {modalDoc && (
        <DocumentEditor
          doc={modalDoc === 'new' ? null : modalDoc}
          onSave={handleSaveModalDoc}
          onClose={() => setModalDoc(null)}
        />
      )}
    </div>
  );
}
