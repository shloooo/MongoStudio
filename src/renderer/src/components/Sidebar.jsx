import React, {useEffect, useState} from 'react';
import {useConfirm} from './ConfirmProvider.jsx';

function DatabaseNode({
                          connId,
                          dbName,
                          isOpen,
                          onSelectCollection,
                          onCollectionContextMenu,
                          onDatabaseContextMenu,
                          openSignal,
                          connRefreshSignal
                      }) {
    const [expanded, setExpanded] = useState(false);
    const [collections, setCollections] = useState(null);
    const [search, setSearch] = useState('');

    async function expand(forceRefresh) {
        if (collections === null || forceRefresh) {
            const cols = await window.api.conn.listCollections(connId, dbName);
            setCollections([...cols].sort((a, b) => a.name.localeCompare(b.name)));
        }
        setExpanded(true);
    }

    async function toggle() {
        if (!expanded) {
            await expand();
        } else {
            setExpanded(false);
        }
    }

    useEffect(() => {
        if (openSignal && openSignal.connId === connId && openSignal.dbName === dbName) {
            expand(openSignal.force);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openSignal]);

    useEffect(() => {
        if (connRefreshSignal && connRefreshSignal.connId === connId && collections !== null) {
            window.api.conn.listCollections(connId, dbName).then((cols) => {
                setCollections([...cols].sort((a, b) => a.name.localeCompare(b.name)));
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connRefreshSignal]);

    const filtered = collections
        ? collections.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
        : null;

    return (
        <div className="tree-node">
            <div className="tree-row"
                 onClick={toggle}
                 onContextMenu={(e) => {
                     e.preventDefault();
                     onDatabaseContextMenu(e, {connId, dbName});
                 }}>
                <i className={`fa-solid fa-chevron-right twisty ${expanded ? 'is-expanded' : ''}`}/>
                <i className="fa-solid fa-database tree-icon"/> {dbName}
            </div>
            <div className={`tree-children-wrap ${expanded ? 'is-open' : ''}`}>
                <div className="tree-children">
                    {collections === null && <div className="tree-loading">loading...</div>}
                    {collections && collections.length > 5 && (
                        <input className="collection-search-input"
                               placeholder="Search collections..."
                               value={search}
                               onClick={(e) => e.stopPropagation()}
                               onChange={(e) => setSearch(e.target.value)}/>
                    )}
                    {collections && collections.length === 0 && <div className="tree-empty">no collections</div>}
                    {filtered && filtered.length === 0 && collections.length > 0 && (
                        <div className="tree-empty">no matches</div>
                    )}
                    {filtered && filtered.map((c) => (
                        <div key={c.name}
                             className="tree-row leaf"
                             onClick={() => onSelectCollection({connId, dbName, collection: c.name})}
                             onContextMenu={(e) => {
                                 e.preventDefault();
                                 onCollectionContextMenu(e, {connId, dbName, collection: c.name});
                             }}>
                            <i className="fa-solid fa-file-lines tree-icon"/> {c.name}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function ConnectionNode({
                            conn,
                            isOpen,
                            onToggle,
                            onEdit,
                            onDelete,
                            onRefresh,
                            onSelectCollection,
                            onCollectionContextMenu,
                            onConnectionContextMenu,
                            onDatabaseContextMenu,
                            openDbSignal,
                            refreshDbSignal
                        }) {
    const [expanded, setExpanded] = useState(false);
    const [databases, setDatabases] = useState(null);
    const confirmDialog = useConfirm();

    useEffect(() => {
        if (isOpen && refreshDbSignal && refreshDbSignal.connId === conn.id) {
            window.api.conn.listDatabases(conn.id).then((dbs) => setDatabases([...dbs].sort((a, b) => a.name.localeCompare(b.name))));
            setExpanded(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshDbSignal]);

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
            <div className="tree-row conn-row"
                 onContextMenu={(e) => {
                     e.preventDefault();
                     onConnectionContextMenu(e, conn);
                 }}>
                <i className={`fa-solid fa-chevron-right twisty ${isOpen && expanded ? 'is-expanded' : ''}`} onClick={toggleExpand}/>
                <span className={`conn-dot ${isOpen ? 'online' : 'offline'}`}/>
                <span className="conn-name" onClick={toggleExpand}>{conn.name}</span>
                <span className="row-actions">
          <button title={isOpen ? 'Disconnect' : 'Connect'} onClick={() => onToggle(conn)}>{isOpen ? '⏻' : '▶'}</button>
                    {isOpen && (
                        <button title="Refresh" onClick={() => onRefresh(conn)}>⟳</button>
                    )}
                    <button title="Edit" onClick={() => onEdit(conn)}>✎</button>
          <button title="Delete"
                  className="delete-icon-btn"
                  onClick={handleDeleteClick}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M6.5 4V2.5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1V4M12.5 4l-.6 9.4a1 1 0 0 1-1 .9H5.1a1 1 0 0 1-1-.9L3.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M6.5 7v4M9.5 7v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </button>
        </span>
            </div>
            {isOpen && (
                <div className={`tree-children-wrap ${expanded ? 'is-open' : ''}`}>
                    <div className="tree-children">
                        {databases === null && <div className="tree-loading">loading...</div>}
                        {databases && databases.map((db) => (
                            <DatabaseNode
                                key={db.name}
                                connId={conn.id}
                                dbName={db.name}
                                onSelectCollection={onSelectCollection}
                                onCollectionContextMenu={onCollectionContextMenu}
                                onDatabaseContextMenu={onDatabaseContextMenu}
                                openSignal={openDbSignal}
                                connRefreshSignal={refreshDbSignal}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function Sidebar({
                                    connections,
                                    openConnIds,
                                    onAddConnection,
                                    onEditConnection,
                                    onDeleteConnection,
                                    onToggleConnection,
                                    onRefreshConnection,
                                    onSelectCollection,
                                    onOpenSettings,
                                    onCollectionContextMenu,
                                    onConnectionContextMenu,
                                    onDatabaseContextMenu,
                                    openDbSignal,
                                    refreshDbSignal
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
                    <ConnectionNode key={conn.id}
                                    conn={conn}
                                    isOpen={openConnIds.has(conn.id)}
                                    onToggle={onToggleConnection}
                                    onEdit={onEditConnection}
                                    onDelete={onDeleteConnection}
                                    onRefresh={onRefreshConnection}
                                    onSelectCollection={onSelectCollection}
                                    onCollectionContextMenu={onCollectionContextMenu}
                                    onConnectionContextMenu={onConnectionContextMenu}
                                    onDatabaseContextMenu={onDatabaseContextMenu}
                                    openDbSignal={openDbSignal}
                                    refreshDbSignal={refreshDbSignal}/>
                ))}
            </div>
            <div className="sidebar-footer">
                <button className="sidebar-footer-btn" onClick={onOpenSettings}>⚙ Settings</button>
            </div>
        </aside>
    );
}