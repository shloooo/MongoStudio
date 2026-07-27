import React, { useState } from 'react';
import { bsonTypeOf, shortLabel, FIELD_TYPES, coerceToType, toEditableRaw } from '../lib/bsonTypes.js';

function isExpandable(value) {
  const t = bsonTypeOf(value);
  return t === 'Object' || t === 'Array';
}

function TypeBadge({ type, onChange, disabled }) {
  if (disabled) return <span className="type-badge">{type}</span>;
  return (
    <select className="type-badge type-badge-select" value={type} onChange={(e) => onChange(e.target.value)}>
      {FIELD_TYPES.filter((t) => t !== 'DBRef' && t !== 'Binary').map((t) => <option key={t} value={t}>{t}</option>)}
    </select>
  );
}

function ValueEditor({ value, onCommit, onCancel }) {
  const initialType = bsonTypeOf(value) === 'Undefined' ? 'String' : bsonTypeOf(value);
  const isLocked = initialType === 'DBRef' || initialType === 'Binary';
  const [type, setType] = useState(initialType);
  const [raw, setRaw] = useState(() => toEditableRaw(value));
  const [error, setError] = useState('');
  const containerRef = React.useRef(null);

  React.useEffect(() => {
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
      const coerced = coerceToType(raw, type);
      onCommit(coerced);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  }

  if (isLocked) {
    return (
      <span className="inline-value-editor" ref={containerRef}>
        <span className="type-badge">{initialType}</span>
        <span className="inline-locked-hint">
          {initialType === 'DBRef' ? 'DBRef values cannot be edited inline yet.' : 'Binary values cannot be edited inline.'}
        </span>
        <button className="tiny-btn" onMouseDown={(e) => e.preventDefault()} onClick={onCancel}>✕</button>
      </span>
    );
  }

  return (
    <span className="inline-value-editor" ref={containerRef}>
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
        <input
          className="inline-input"
          autoFocus
          value={raw}
          onChange={(e) => { setRaw(e.target.value); setError(''); }}
          onKeyDown={handleKeyDown}
        />
      )}
      <button className="tiny-btn" onMouseDown={(e) => e.preventDefault()} onClick={commit}>✓</button>
      <button className="tiny-btn" onMouseDown={(e) => e.preventDefault()} onClick={onCancel}>✕</button>
      {error && <span className="inline-error">{error}</span>}
    </span>
  );
}

function NewFieldRow({ isArray, onAdd, onCancel }) {
  const [key, setKey] = useState('');
  const [type, setType] = useState('String');
  const [raw, setRaw] = useState('');
  const [error, setError] = useState('');

  function commit() {
    try {
      const coerced = type === 'Object' ? {} : type === 'Array' ? [] : coerceToType(raw, type);
      onAdd(isArray ? undefined : key, coerced);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  }

  return (
    <div className="tree-row new-field-row">
      {!isArray && (
        <input className="inline-input key-input" autoFocus placeholder="field name" value={key}
          onChange={(e) => setKey(e.target.value)} onKeyDown={handleKeyDown} />
      )}
      <span className="tree-colon">:</span>
      <TypeBadge type={type} onChange={setType} />
      {type !== 'Object' && type !== 'Array' && type !== 'Null' && (
        <input className="inline-input" placeholder="value" value={raw}
          autoFocus={isArray} onChange={(e) => { setRaw(e.target.value); setError(''); }} onKeyDown={handleKeyDown} />
      )}
      <button className="tiny-btn" onClick={commit}>Add</button>
      <button className="tiny-btn" onClick={onCancel}>Cancel</button>
      {error && <span className="inline-error">{error}</span>}
    </div>
  );
}

function TreeNode({ nodeKey, value, path, onChange, onDelete, depth, defaultCollapsed }) {
  const expandable = isExpandable(value);
  const [collapsed, setCollapsed] = useState(defaultCollapsed && depth > 0);
  const [editing, setEditing] = useState(false);
  const [addingField, setAddingField] = useState(false);
  const type = bsonTypeOf(value);

  function updateChild(childKey, newValue) {
    if (Array.isArray(value)) {
      const next = [...value];
      next[childKey] = newValue;
      onChange(next);
    } else {
      onChange({ ...value, [childKey]: newValue });
    }
  }

  function deleteChild(childKey) {
    if (Array.isArray(value)) {
      onChange(value.filter((_, i) => i !== childKey));
    } else {
      const next = { ...value };
      delete next[childKey];
      onChange(next);
    }
  }

  function addChild(childKey, childValue) {
    if (Array.isArray(value)) {
      onChange([...value, childValue]);
    } else {
      if (!childKey) return;
      onChange({ ...value, [childKey]: childValue });
    }
    setAddingField(false);
  }

  if (expandable) {
    const entries = Array.isArray(value) ? value.map((v, i) => [i, v]) : Object.entries(value);
    return (
      <div className="tree-node-block">
        <div className="tree-row expandable-row">
          <span className="twisty" onClick={() => setCollapsed((c) => !c)}>{collapsed ? '▸' : '▾'}</span>
          {nodeKey !== undefined && <span className="tree-key" onClick={() => setCollapsed((c) => !c)}>{nodeKey}</span>}
          {nodeKey !== undefined && <span className="tree-colon">:</span>}
          <span className="tree-summary" onClick={() => setCollapsed((c) => !c)}>{shortLabel(value)}</span>
          {onDelete && (
            <button className="tree-delete-btn" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete">✕</button>
          )}
        </div>
        {!collapsed && (
          <div className="tree-children-block">
            {entries.map(([k, v]) => (
              <TreeNode
                key={k}
                nodeKey={k}
                value={v}
                path={[...path, k]}
                depth={depth + 1}
                defaultCollapsed={defaultCollapsed}
                onChange={(newVal) => updateChild(k, newVal)}
                onDelete={() => deleteChild(k)}
              />
            ))}
            {addingField ? (
              <NewFieldRow isArray={Array.isArray(value)} onAdd={addChild} onCancel={() => setAddingField(false)} />
            ) : (
              <div className="tree-row add-field-row" onClick={() => setAddingField(true)}>
                <span className="twisty" />
                <span className="add-field-label">+ Add {Array.isArray(value) ? 'item' : 'field'}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const isLeafLocked = type === 'DBRef' || type === 'Binary';

  return (
    <div className="tree-row leaf-row">
      <span className="twisty" />
      {nodeKey !== undefined && <span className="tree-key">{nodeKey}</span>}
      {nodeKey !== undefined && <span className="tree-colon">:</span>}
      {editing && !isLeafLocked ? (
        <ValueEditor
          value={value}
          onCommit={(v) => { onChange(v); setEditing(false); }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <span
            className={`tree-value type-${type.toLowerCase()} ${isLeafLocked ? 'not-editable' : ''}`}
            onClick={() => { if (!isLeafLocked) setEditing(true); }}
            title={isLeafLocked ? `${type} values cannot be edited inline yet` : ''}
          >
            {shortLabel(value)}
          </span>
          <span className="type-badge">{type}</span>
        </>
      )}
      {onDelete && (
        <button className="tree-delete-btn" onClick={() => onDelete()} title="Delete">✕</button>
      )}
    </div>
  );
}

/**
 * Renders a BSON document as an editable, collapsible tree.
 * `value` is the root document object. Calls onChange(newDoc) on any edit.
 */
export default function DocumentTree({ value, onChange, defaultCollapsed = false }) {
  return (
    <div className="document-tree">
      <TreeNode
        nodeKey={undefined}
        value={value}
        path={[]}
        depth={0}
        defaultCollapsed={defaultCollapsed}
        onChange={onChange}
        onDelete={null}
      />
    </div>
  );
}
