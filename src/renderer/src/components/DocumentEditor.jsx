import React, {useMemo, useRef, useState} from 'react';
import {parseShell, toShellText} from '../lib/shellSyntax.js';
import DocumentTree from './DocumentTree.jsx';
import ContextMenu from './ContextMenu.jsx';

export default function DocumentEditor({ doc, onSave, onClose, defaultMode }) {
  const isNew = doc === null;
  const initialValue = useMemo(() => doc || { field: 'value' }, [doc]);
  const [mode, setMode] = useState(defaultMode === 'raw' ? 'raw' : 'tree'); // 'tree' | 'raw'
  const [treeValue, setTreeValue] = useState(initialValue);
  const [rawText, setRawText] = useState(() => toShellText(initialValue));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const textareaRef = useRef(null);
  const [nodeContextMenu, setNodeContextMenu] = useState(null);

  const rawParsed = useMemo(() => {
    if (mode !== 'raw') return { ok: true, value: treeValue };
    try {
      return { ok: true, value: parseShell(rawText) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }, [mode, rawText, treeValue]);

  function switchToRaw() {
    setRawText(toShellText(treeValue));
    setMode('raw');
  }

  function switchToTree() {
    if (!rawParsed.ok) {
      setError('Fix the syntax error before switching to tree view: ' + rawParsed.error);
      return;
    }
    setTreeValue(rawParsed.value);
    setMode('tree');
  }

  function handleTreeChange(newValue) {
    setTreeValue(newValue);
  }

  async function handleSave() {
    const finalValue = mode === 'raw' ? rawParsed.value : treeValue;
    if (mode === 'raw' && !rawParsed.ok) {
      setError('Invalid document: ' + rawParsed.error);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(finalValue, isNew);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleNodeContextMenu(e, node) {
    const items = [];
    if (node.startEdit) {
      items.push({label: 'Edit', onClick: node.startEdit});
    }
    items.push({label: 'Copy document (raw)', onClick: node.onCopyValue});
    items.push({label: 'Copy document (shell syntax)', onClick: node.onCopyRaw});
    if (node.onDelete) {
      items.push({separator: true});
      items.push({label: 'Delete', danger: true, onClick: node.onDelete});
    }
    setNodeContextMenu({x: e.clientX, y: e.clientY, items});
  }

  function handleFindReplace() {
    if (!findText) return;
    let text = mode === 'raw' ? rawText : toShellText(treeValue);
    const next = text.split(findText).join(replaceText);
    if (mode === 'raw') {
      setRawText(next);
    } else {
      try {
        setTreeValue(parseShell(next));
      } catch (err) {
        setError('Replace produced invalid syntax: ' + err.message);
      }
    }
  }

  function handleKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      setShowFindReplace((s) => !s);
    }
  }

  return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal wide" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
          <div className="editor-header-row">
            <h3>{isNew ? 'New Document' : 'Edit Document'}</h3>
            <div className="editor-mode-toggle">
              <button className={mode === 'tree' ? 'active' : ''} onClick={switchToTree}>Tree</button>
              <button className={mode === 'raw' ? 'active' : ''} onClick={switchToRaw}>Raw</button>
            </div>
          </div>

          {mode === 'raw' && (
              <p className="hint-text">
                Supports shell syntax — <code>ObjectId("...")</code>, <code>DBRef("db.coll",
                ObjectId("..."))</code>,{' '}
                <code>UUID("...")</code>, <code>ISODate("...")</code>, <code>NumberLong("...")</code>, etc.
              </p>
          )}

          <div className="editor-toolbar-row">
            <button
                onClick={() => setShowFindReplace((s) => !s)}>{showFindReplace ? 'Hide Find/Replace' : 'Find & Replace'}</button>
          </div>

          {showFindReplace && (
              <div className="find-replace-bar">
                <input placeholder="Find..." value={findText} onChange={(e) => setFindText(e.target.value)}/>
                <input placeholder="Replace with..." value={replaceText}
                       onChange={(e) => setReplaceText(e.target.value)}/>
                <button onClick={handleFindReplace} disabled={!findText}>Replace All</button>
              </div>
          )}

          {mode === 'tree' ? (
              <div className="tree-editor-scroll">
                <DocumentTree value={treeValue} onChange={handleTreeChange} onNodeContextMenu={handleNodeContextMenu}/>
              </div>
          ) : (
              <textarea
                  ref={textareaRef}
                  className={`json-editor ${!rawParsed.ok ? 'has-error' : ''}`}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  spellCheck={false}
                  rows={20}
              />
          )}

          {mode === 'raw' && !rawParsed.ok && <div className="error-banner">{rawParsed.error}</div>}
          {error && <div className="error-banner">{error}</div>}

          <div className="modal-actions">
            <div className="spacer"/>
            <button onClick={onClose}>Cancel</button>
            <button className="primary" onClick={handleSave} disabled={(mode === 'raw' && !rawParsed.ok) || saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
          {nodeContextMenu && (
              <ContextMenu
                  x={nodeContextMenu.x}
                  y={nodeContextMenu.y}
                  items={nodeContextMenu.items}
                  onClose={() => setNodeContextMenu(null)}
              />
          )}
        </div>
      </div>
  );
}