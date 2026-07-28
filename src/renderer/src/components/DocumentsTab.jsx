import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {EJSON} from 'bson';
import {parseShell, toShellText} from '../lib/shellSyntax.js';
import {bsonTypeOf, coerceToType, FIELD_TYPES, shortLabel, toEditableRaw} from '../lib/bsonTypes.js';
import DocumentEditor from './DocumentEditor.jsx';
import ContextMenu from './ContextMenu.jsx';
import BulkUpdateDialog from './BulkUpdateDialog.jsx';
import {useConfirm} from './ConfirmProvider.jsx';
import {reportError} from '../lib/errorBus.js';

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

const SETTABLE_FIELD_TYPES = FIELD_TYPES.filter((t) => !NON_INLINE_EDITABLE_TYPES.includes(t));

function InlineCellEditor({ value, onCommit, onCancel }) {
  const type = bsonTypeOf(value) === 'Undefined' ? 'String' : bsonTypeOf(value);
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
        {type === 'Boolean' ? (
            <select className="inline-input" autoFocus value={raw} onChange={(e) => setRaw(e.target.value)}
                    onKeyDown={handleKeyDown}>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
        ) : type === 'Null' ? (
            <span className="inline-input inline-input-static">null</span>
        ) : (
            <input className="inline-input" autoFocus value={raw}
                   onChange={(e) => {
                     setRaw(e.target.value);
                     setError('');
                   }} onKeyDown={handleKeyDown}/>
        )}
        <button className="tiny-btn" onMouseDown={(e) => e.preventDefault()} onClick={commit}>✓</button>
        {error && <span className="inline-error">{error}</span>}
    </span>
  );
}

function SetFieldValueDialog({field, onApply, onClose}) {
  const [type, setType] = useState('String');
  const [raw, setRaw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleApply() {
    try {
      const coerced = type === 'Null' ? null : coerceToType(raw, type);
      setBusy(true);
      await onApply(coerced);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3>Set value for "{field}" on all matching documents</h3>
          <p className="hint-text">Applies to every document currently matching the active filter, not just this
            page.</p>
          <label>Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {FIELD_TYPES.filter((t) => t !== 'Object' && t !== 'Array' && t !== 'DBRef' && t !== 'Binary').map((t) =>
                <option key={t} value={t}>{t}</option>)}
          </select>
          {type !== 'Null' && (
              <>
                <label>Value</label>
                {type === 'Boolean' ? (
                    <select value={raw} onChange={(e) => setRaw(e.target.value)}>
                      <option value="">Select...</option>
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                ) : (
                    <input value={raw} onChange={(e) => setRaw(e.target.value)}/>
                )}
              </>
          )}
          {error && <div className="error-banner">{error}</div>}
          <div className="modal-actions">
            <div className="spacer"/>
            <button onClick={onClose}>Cancel</button>
            <button className="primary" onClick={handleApply} disabled={busy}>{busy ? 'Applying...' : 'Apply'}</button>
          </div>
        </div>
      </div>
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
  const [headerContextMenu, setHeaderContextMenu] = useState(null);
  const [rowContextMenu, setRowContextMenu] = useState(null);
  const [setValueField, setSetValueField] = useState(null);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [defaultEditorTab, setDefaultEditorTab] = useState('tree');
  const confirmDialog = useConfirm();

  useEffect(() => {
    window.api.settings.get().then((s) => {
      if (s && s.defaultEditorTab) setDefaultEditorTab(s.defaultEditorTab);
    });
  }, []);

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
      if (err.message.includes('not authorized on')) {
        setError('Error: Current user has no access to this collection');
      } else {
        setError(err.message);
      }
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
    const ok = await confirmDialog(`Delete ${selectedIds.size} document(s)?`, {title: 'Delete documents', confirmLabel: 'Delete'});
    if (!ok) return;
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

  async function handleDeleteDoc(doc) {
    const ok = await confirmDialog('Delete this document?', {title: 'Delete document', confirmLabel: 'Delete'});
    if (!ok) return;
    try {
      await window.api.data.deleteOne({
        connId: selection.connId,
        dbName: selection.dbName,
        collection: selection.collection,
        filter: EJSON.stringify({ _id: doc._id })
      });
      runQuery();
    } catch (err) {
      reportError(err.message, 'Delete document');
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch((err) => reportError(err.message, 'Clipboard'));
  }

  function handleRowContextMenu(e, doc) {
    e.preventDefault();
    setRowContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {label: 'Edit document', onClick: () => setModalDoc(doc)},
        {separator: true},
        {label: 'Copy document (raw)', onClick: () => copyToClipboard(JSON.stringify(EJSON.serialize(doc)))},
        {label: 'Copy document (shell syntax)', onClick: () => copyToClipboard(toShellText(doc))},
        {separator: true},
        {label: 'Delete', danger: true, onClick: () => handleDeleteDoc(doc)}
      ]
    });
  }

  function handleCellContextMenu(e, doc, field, rowIndex) {
    e.preventDefault();
    e.stopPropagation();
    const hasValue = Object.prototype.hasOwnProperty.call(doc, field);
    const canSetType = hasValue && isInlineEditable(doc[field]);
    setRowContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {label: 'Edit document', onClick: () => setModalDoc(doc)},
        {separator: true},
        {
          label: 'Set field type',
          disabled: !canSetType,
          submenu: SETTABLE_FIELD_TYPES.map((t) => ({
            label: t,
            onClick: () => handleSetFieldType(rowIndex, field, t)
          }))
        },
        {separator: true},
        {label: 'Copy field value (raw)', disabled: !hasValue, onClick: () => copyToClipboard(JSON.stringify(EJSON.serialize(doc[field])))},
        {label: 'Copy field value (shell syntax)', disabled: !hasValue, onClick: () => copyToClipboard(toShellText(doc[field]))},
        {separator: true},
        {label: 'Copy document (raw)', onClick: () => copyToClipboard(JSON.stringify(EJSON.serialize(doc)))},
        {label: 'Copy document (shell syntax)', onClick: () => copyToClipboard(toShellText(doc))},
        {separator: true},
        {label: 'Delete field value', danger: true, disabled: !hasValue, onClick: () => handleDeleteFieldValue(doc, field)}
      ]
    });
  }

  async function handleSetFieldType(rowIndex, field, newType) {
    const doc = docs[rowIndex];
    if (!doc || !Object.prototype.hasOwnProperty.call(doc, field)) return;
    try {
      const raw = toEditableRaw(doc[field]);
      const coerced = coerceToType(raw, newType);
      await handleCellCommit(rowIndex, field, coerced);
    } catch (err) {
      reportError(err.message, 'Set field type');
    }
  }

  async function handleDeleteFieldValue(doc, field) {
    const ok = await confirmDialog(`Remove field "${field}" from this document?`, {title: 'Delete field', confirmLabel: 'Delete'});
    if (!ok) return;
    try {
      await persistFieldUpdate(doc, field, undefined);
      setDocs((prev) => prev.map((d) => {
        if (d !== doc) return d;
        const next = {...d};
        delete next[field];
        return next;
      }));
    } catch (err) {
      reportError(err.message, 'Delete field');
    }
  }

  async function persistFieldUpdate(doc, field, newValue) {
    const idFilter = EJSON.stringify({ _id: doc._id });
    const update = newValue === undefined
        ? {$unset: {[field]: ''}}
        : {$set: {[field]: newValue}};
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
    try {
      await persistFieldUpdate(doc, field, newValue);
      setDocs((prev) => {
        const next = [...prev];
        next[rowIndex] = { ...next[rowIndex], [field]: newValue };
        return next;
      });
      setEditingCell(null);
    } catch (err) {
      reportError(err.message, 'Update field');
    }
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

  async function handleDeleteFieldOnAll(field) {
    const ok = await confirmDialog(`Remove field "${field}" from all documents matching the current filter?`, {title: 'Delete field on all', confirmLabel: 'Delete'});
    if (!ok) return;
    const filterValue = parseShell(filter || '{}');
    await window.api.data.updateMany({
      connId: selection.connId,
      dbName: selection.dbName,
      collection: selection.collection,
      filter: EJSON.stringify(filterValue),
      update: EJSON.stringify({$unset: {[field]: ''}})
    });
    runQuery();
  }

  async function handleSetFieldOnAll(field, value) {
    const filterValue = parseShell(filter || '{}');
    await window.api.data.updateMany({
      connId: selection.connId,
      dbName: selection.dbName,
      collection: selection.collection,
      filter: EJSON.stringify(filterValue),
      update: EJSON.stringify({$set: {[field]: value}})
    });
    setSetValueField(null);
    runQuery();
  }

  function handleHeaderContextMenu(e, field) {
    e.preventDefault();
    setHeaderContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {label: `Set value on all...`, onClick: () => setSetValueField(field)},
        {separator: true},
        {label: `Delete field on all`, danger: true, onClick: () => handleDeleteFieldOnAll(field)}
      ]
    });
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

  const allOnPageSelected = docs.length > 0 && docs.every((d) => Array.from(selectedIds).some((s) => s.key === JSON.stringify(d._id)));
  const someOnPageSelected = !allOnPageSelected && docs.some((d) => Array.from(selectedIds).some((s) => s.key === JSON.stringify(d._id)));

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        for (const doc of docs) {
          const key = JSON.stringify(doc._id);
          const existing = Array.from(next).find((e) => e.key === key);
          if (existing) next.delete(existing);
        }
      } else {
        for (const doc of docs) {
          const key = JSON.stringify(doc._id);
          if (!Array.from(next).some((e) => e.key === key)) next.add({ key, value: doc._id });
        }
      }
      return next;
    });
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
      <div className="documents-tab">
        <div className="query-bar">
          <div className="query-field">
            <label>Filter</label>
            <input value={filter} onChange={(e) => setFilter(e.target.value)}
                   placeholder='{name: "value"} or {_id: ObjectId("...")}'/>
          </div>
          <div className="query-field">
            <label>Sort</label>
            <input value={sort} onChange={(e) => setSort(e.target.value)} placeholder='{_id: -1}'/>
          </div>
          <button className="primary" onClick={handleRunClick} disabled={loading}>{loading ? '...' : 'Run'}</button>
        </div>

        <div className="toolbar">
          <button onClick={() => setModalDoc('new')}>+ New Document</button>
          <button onClick={handleDeleteSelected} disabled={selectedIds.size === 0}>Delete ({selectedIds.size})</button>
          <div className="spacer"/>
          <button onClick={handleImport}>Import</button>
          <button onClick={() => setShowBulkUpdate(true)}>Bulk Update</button>
          <button onClick={() => handleExport('json')}>Export JSON</button>
          <button onClick={() => handleExport('csv')}>Export CSV</button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="results-area">
          <table className="doc-table spreadsheet-table">
            <thead>
            <tr>
              <th className="col-checkbox">
                <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    ref={(el) => { if (el) el.indeterminate = someOnPageSelected; }}
                    onChange={toggleSelectAll}
                    title={allOnPageSelected ? 'Deselect all' : 'Select all on this page'}
                    disabled={docs.length === 0}
                />
              </th>
              <th className="col-id">_id</th>
              {fieldColumns.map((f) => <th key={f} onContextMenu={(e) => handleHeaderContextMenu(e, f)}>{f}</th>)}
              <th className="col-fill"></th>
              <th className="col-expand"></th>
            </tr>
            </thead>
            <tbody>
            {docs.map((doc, rowIndex) => (
                <tr key={rowIndex} onContextMenu={(e) => handleRowContextMenu(e, doc)}>
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
                        <td key={field} className="spreadsheet-cell" onContextMenu={(e) => handleCellContextMenu(e, doc, field, rowIndex)}>
                          {isEditing ? (
                              <InlineCellEditor
                                  value={doc[field]}
                                  onCommit={(v) => handleCellCommit(rowIndex, field, v)}
                                  onCancel={() => setEditingCell(null)}
                              />
                          ) : (
                              <span
                                  className={`cell-value-trigger ${editable ? '' : 'not-editable'}`}
                                  onClick={() => {
                                    if (editable) setEditingCell({rowIndex, field});
                                  }}
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
                    <button className="tiny-btn" onClick={() => setModalDoc(doc)} title="Open full document editor">⤢
                    </button>
                  </td>
                </tr>
            ))}
            {docs.length === 0 && !loading && (
                <tr>
                  <td colSpan={fieldColumns.length + 4} className="tree-empty">No documents found</td>
                </tr>
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
                defaultMode={defaultEditorTab}
                onSave={handleSaveModalDoc}
                onClose={() => setModalDoc(null)}
            />
        )}
        {headerContextMenu && (
            <ContextMenu
                x={headerContextMenu.x}
                y={headerContextMenu.y}
                items={headerContextMenu.items}
                onClose={() => setHeaderContextMenu(null)}
            />
        )}
        {rowContextMenu && (
            <ContextMenu
                x={rowContextMenu.x}
                y={rowContextMenu.y}
                items={rowContextMenu.items}
                onClose={() => setRowContextMenu(null)}
            />
        )}
        {setValueField && (
            <SetFieldValueDialog
                field={setValueField}
                onApply={(value) => handleSetFieldOnAll(setValueField, value)}
                onClose={() => setSetValueField(null)}
            />
        )}
        {showBulkUpdate && (
            <BulkUpdateDialog
                selection={selection}
                onClose={() => setShowBulkUpdate(false)}
                onApplied={() => runQuery()}
            />
        )}
      </div>
  );
}