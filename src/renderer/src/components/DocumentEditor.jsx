import React, {useMemo, useRef, useState} from 'react';
import {Trans, useTranslation} from 'react-i18next';
import {parseShell, toShellText} from '../lib/shellSyntax.js';
import DocumentTree from './DocumentTree.jsx';
import ContextMenu from './ContextMenu.jsx';

export default function DocumentEditor({ doc, onSave, onClose, defaultMode }) {
  const {t} = useTranslation();
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
      setError(t('documentEditor.errorFixSyntax', {error: rawParsed.error}));
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
      setError(t('documentEditor.errorInvalidDocument', {error: rawParsed.error}));
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
      items.push({label: t('documentActions.edit'), onClick: node.startEdit});
    }
    items.push({label: t('documentActions.copyDocumentRaw'), onClick: node.onCopyValue});
    items.push({label: t('documentActions.copyDocumentShell'), onClick: node.onCopyRaw});
    if (node.onDelete) {
      items.push({separator: true});
      items.push({label: t('documentActions.delete'), danger: true, onClick: node.onDelete});
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
        setError(t('documentEditor.errorReplaceInvalidSyntax', {error: err.message}));
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
            <h3>{isNew ? t('documentEditor.newDocument') : t('documentEditor.editDocument')}</h3>
            <div className="editor-mode-toggle">
              <button className={mode === 'tree' ? 'active' : ''}
                      onClick={switchToTree}>{t('documentEditor.tree')}</button>
              <button className={mode === 'raw' ? 'active' : ''}
                      onClick={switchToRaw}>{t('documentEditor.raw')}</button>
            </div>
          </div>

          {mode === 'raw' && (
              <p className="hint-text">
                <Trans i18nKey="documentEditor.shellSyntaxHint"
                       components={[<code key="0"/>, <code key="1"/>, <code key="2"/>, <code key="3"/>,
                         <code key="4"/>]}/>
              </p>
          )}

          <div className="editor-toolbar-row">
            <button
                onClick={() => setShowFindReplace((s) => !s)}>{showFindReplace ? t('documentEditor.hideFindReplace') : t('documentEditor.findReplace')}</button>
          </div>

          {showFindReplace && (
              <div className="find-replace-bar">
                <input placeholder={t('documentEditor.findPlaceholder')} value={findText}
                       onChange={(e) => setFindText(e.target.value)}/>
                <input placeholder={t('documentEditor.replacePlaceholder')} value={replaceText}
                       onChange={(e) => setReplaceText(e.target.value)}/>
                <button onClick={handleFindReplace} disabled={!findText}>{t('documentEditor.replaceAll')}</button>
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
            <button onClick={onClose}>{t('documentEditor.cancel')}</button>
            <button className="primary" onClick={handleSave} disabled={(mode === 'raw' && !rawParsed.ok) || saving}>
              {saving ? t('documentEditor.saving') : t('documentEditor.save')}
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