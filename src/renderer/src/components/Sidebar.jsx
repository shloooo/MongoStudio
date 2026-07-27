import React, {useEffect, useState} from 'react';
import {useConfirm} from './ConfirmProvider.jsx';

function DatabaseNode({ connId, dbName, isOpen, onSelectCollection, onCollectionContextMenu }) {
  const [expanded, setExpanded] = useState(false);
  const [collections, setCollections] = useState(null);
  const [search, setSearch] = useState('');

  async function toggle() {
    if (!expanded && collections === null) {
      const cols = await window.api.conn.listCollections(connId, dbName);
      setCollections([...cols].sort((a, b) => a.name.localeCompare(b.name)));
    }
    setExpanded((e) => !e);
  }

  const filtered = collections
      ? collections.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
      : null;

  return (
      <div className="tree-node">
          <div className="tree-row" onClick={toggle}>
              <span className="twisty">{expanded ? '▾' : '▸'}</span>
              <span className="icon">🗄</span> {dbName}
          </div>
          {expanded && (
              <div className="tree-children">
                  {collections === null && <div className="tree-loading">loading...</div>}
                  {collections && collections.length > 5 && (
                      <input
                          className="collection-search-input"
                          placeholder="Search collections..."
                          value={search}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setSearch(e.target.value)}
                      />
                  )}
                  {collections && collections.length === 0 && <div className="tree-empty">no collections</div>}
                  {filtered && filtered.length === 0 && collections.length > 0 && (
                      <div className="tree-empty">no matches</div>
                  )}
                  {filtered && filtered.map((c) => (
                      <div
                          key={c.name}
                          className="tree-row leaf"
                          onClick={() => onSelectCollection({connId, dbName, collection: c.name})}
                          onContextMenu={(e) => {
                              e.preventDefault();
                              onCollectionContextMenu(e, {connId, dbName, collection: c.name});
                          }}
                      >
                          <span className="icon">📄</span> {c.name}
                      </div>
                  ))}
              </div>
          )}
      </div>
  );
}

function ConnectionNode({ conn, isOpen, onToggle, onEdit, onDelete, onSelectCollection, onCollectionContextMenu, onConnectionContextMenu }) {
  const [expanded, setExpanded] = useState(false);
  const [databases, setDatabases] = useState(null);
    const confirmDialog = useConfirm();

    async function handleDeleteClick() {
        const ok = await confirmDialog(`Delete connection "${conn.name}"? This cannot be undone.`, {
            title: 'Delete connection',
            confirmLabel: 'Delete'
        });
        if (ok) onDelete(conn.id);
    }

  useEffect(() => {
    if (isOpen) {
      setExpanded(true);
      window.api.conn.listDatabases(conn.id).then((dbs) => setDatabases([...dbs].sort((a, b) => a.name.localeCompare(b.name))));
    } else {
      setExpanded(false);
      setDatabases(null);
    }
  }, [isOpen, conn.id]);

  async function toggleExpand() {
    if (!isOpen) return;
    if (!expanded && databases === null) {
      const dbs = await window.api.conn.listDatabases(conn.id);
      setDatabases([...dbs].sort((a, b) => a.name.localeCompare(b.name)));
    }
    setExpanded((e) => !e);
  }

  return (
      <div className="tree-node">
          <div
              className="tree-row conn-row"
              onContextMenu={(e) => {
                  e.preventDefault();
                  onConnectionContextMenu(e, conn);
              }}
          >
              <span className="twisty" onClick={toggleExpand}>{isOpen && expanded ? '▾' : '▸'}</span>
              <span className={`conn-dot ${isOpen ? 'online' : 'offline'}`}/>
              <span className="conn-name" onClick={toggleExpand}>{conn.name}</span>
              <span className="row-actions">
          <button title={isOpen ? 'Disconnect' : 'Connect'} onClick={() => onToggle(conn)}>{isOpen ? '⏻' : '▶'}</button>
          <button title="Edit" onClick={() => onEdit(conn)}>✎</button>
          <button
              title="Delete"
              className="delete-icon-btn"
              onClick={handleDeleteClick}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M6.5 4V2.5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1V4M12.5 4l-.6 9.4a1 1 0 0 1-1 .9H5.1a1 1 0 0 1-1-.9L3.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M6.5 7v4M9.5 7v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </button>
        </span>
          </div>
          {isOpen && expanded && (
              <div className="tree-children">
                  {databases === null && <div className="tree-loading">loading...</div>}
                  {databases && databases.map((db) => (
                      <DatabaseNode
                          key={db.name}
                          connId={conn.id}
                          dbName={db.name}
                          onSelectCollection={onSelectCollection}
                          onCollectionContextMenu={onCollectionContextMenu}
                      />
                  ))}
              </div>
          )}
      </div>
  );
}

export default function Sidebar({
                                    connections, openConnIds, onAddConnection, onEditConnection,
                                    onDeleteConnection, onToggleConnection, onSelectCollection, onOpenSettings,
                                    onCollectionContextMenu, onConnectionContextMenu
                                }) {
  return (
      <aside className="sidebar">
          <div className="sidebar-header">
              <span>Connections</span>
              <button onClick={onAddConnection} title="New Connection">+</button>
          </div>
          <div className="sidebar-tree">
              {connections.length === 0 && <div className="tree-empty">No connections yet. Click + to add one.</div>}
              {connections.map((conn) => (
                  <ConnectionNode
                      key={conn.id}
                      conn={conn}
                      isOpen={openConnIds.has(conn.id)}
                      onToggle={onToggleConnection}
                      onEdit={onEditConnection}
                      onDelete={onDeleteConnection}
                      onSelectCollection={onSelectCollection}
                      onCollectionContextMenu={onCollectionContextMenu}
                      onConnectionContextMenu={onConnectionContextMenu}
                  />
              ))}
          </div>
          <div className="sidebar-footer">
              <button className="sidebar-footer-btn" onClick={onOpenSettings}>⚙ Settings</button>
          </div>
      </aside>
  );
}