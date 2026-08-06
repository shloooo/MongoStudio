import React, {useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useConfirm} from './ConfirmProvider.jsx';
import {filterVisibleCollections} from '../../lib/systemNamespaces.js';
import {CONNECTION_COLORS} from '../dialogs/ConnectionDialog.jsx';

function connectionColorHex(color) {
    const found = CONNECTION_COLORS.find((c) => c.value === color);
    return found?.hex;
}

function sortCollections(collections, dbName) {
    return filterVisibleCollections(dbName, collections).sort((a, b) => a.name.localeCompare(b.name));
}

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
    const {t} = useTranslation();
    const [expanded, setExpanded] = useState(false);
    const [collections, setCollections] = useState(null);
    const [search, setSearch] = useState('');

    async function expand(forceRefresh) {
        if (collections === null || forceRefresh) {
            const cols = await window.api.conn.listCollections(connId, dbName);
            setCollections(sortCollections(cols, dbName));
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
                setCollections(sortCollections(cols, dbName));
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
                    {collections === null && <div className="tree-loading">{t('sidebar.loading')}</div>}
                    {collections && collections.length > 5 && (
                        <input className="collection-search-input"
                               placeholder={t('sidebar.searchCollections')}
                               value={search}
                               onClick={(e) => e.stopPropagation()}
                               onChange={(e) => setSearch(e.target.value)}/>
                    )}
                    {collections && collections.length === 0 && <div className="tree-empty">{t('sidebar.noCollections')}</div>}
                    {filtered && filtered.length === 0 && collections.length > 0 && (
                        <div className="tree-empty">{t('sidebar.noMatches')}</div>
                    )}
                    {filtered && filtered.map((c) => (
                        <div key={c.name}
                             className="tree-row leaf"
                             onDoubleClick={() => onSelectCollection({connId, dbName, collection: c.name, forceNew: true})}
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
    const {t} = useTranslation();
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
        const ok = await confirmDialog(t('app.confirm.deleteConnection', {name: conn.name}), {
            title: t('app.confirm.deleteConnectionTitle'),
            confirmLabel: t('app.confirm.drop')
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
                {conn.color && (
                    <span className="conn-color-dot" style={{backgroundColor: connectionColorHex(conn.color)}}/>
                )}
                <span className="conn-name" onClick={toggleExpand}>{conn.name}</span>
                {conn.tag && <span className="conn-tag-badge">{conn.tag}</span>}
                <span className="row-actions">
          <button title={isOpen ? t('sidebar.disconnect') : t('sidebar.connect')} onClick={() => onToggle(conn)}>
                        <i className={`fa-solid ${isOpen ? 'fa-plug-circle-xmark' : 'fa-plug'}`}/>
                    </button>
                    {isOpen && (
                        <button title={t('sidebar.refresh')} onClick={() => onRefresh(conn)}><i className="fa-solid fa-rotate"/></button>
                    )}
                    <button title={t('sidebar.edit')} onClick={() => onEdit(conn)}><i className="fa-solid fa-pen"/></button>
          <button title={t('sidebar.delete')}
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
                        {databases === null && <div className="tree-loading">{t('sidebar.loading')}</div>}
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
    const {t} = useTranslation();
    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <span>{t('sidebar.connections')}</span>
                <button onClick={onAddConnection} title={t('sidebar.newConnection')}>+</button>
            </div>
            <div className="sidebar-tree">
                {connections.length === 0 && <div className="tree-empty">{t('sidebar.noConnections')}</div>}
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
                <button className="sidebar-footer-btn" onClick={onOpenSettings}>⚙ {t('sidebar.settings')}</button>
            </div>
        </aside>
    );
}