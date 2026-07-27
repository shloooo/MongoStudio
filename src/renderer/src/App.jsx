import React, {useState, useEffect, useCallback, useRef} from 'react';
import Sidebar from './components/Sidebar.jsx';
import ConnectionDialog from './components/ConnectionDialog.jsx';
import CollectionView from './components/CollectionView.jsx';
import TitleBar from './components/TitleBar.jsx';
import VaultGate from './components/VaultGate.jsx';
import SettingsPage from './components/SettingsPage.jsx';
import ContextMenu from './components/ContextMenu.jsx';
import CopyCollectionDialog from './components/CopyCollectionDialog.jsx';
import './styles.css';

let tabIdCounter = 0;

export default function App() {
    const [unlocked, setUnlocked] = useState(false);
    const [connections, setConnections] = useState([]);
    const [openConnIds, setOpenConnIds] = useState(new Set());
    const [dialogState, setDialogState] = useState({open: false, editing: null});
    const [tabs, setTabs] = useState([]); // [{ id, connId, dbName, collection }]
    const [activeTabId, setActiveTabId] = useState(null);
    const [status, setStatus] = useState(null); // { type: 'info' | 'error', message } | null
    const [showSettings, setShowSettings] = useState(false);
    const [reloadSignal, setReloadSignal] = useState(0);
    const [contextMenu, setContextMenu] = useState(null); // { x, y, items }
    const [copyDialogSource, setCopyDialogSource] = useState(null);

    const refreshConnections = useCallback(async () => {
        const list = await window.api.conn.list();
        setConnections(list);
    }, []);

    useEffect(() => {
        if (unlocked) refreshConnections();
    }, [unlocked, refreshConnections]);

    // F5 (or Ctrl/Cmd+R) reloads the currently active collection tab's data,
    // instead of reloading the whole Electron window.
    useEffect(() => {
        function handleKeyDown(e) {
            if (e.key === 'F5' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'r')) {
                e.preventDefault();
                if (activeTabId) setReloadSignal((s) => s + 1);
            }
        }

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeTabId]);

    async function handleSaveConnection(conn) {
        await window.api.conn.save(conn);
        setDialogState({open: false, editing: null});
        refreshConnections();
    }

    async function handleDeleteConnection(id) {
        await window.api.conn.delete(id);
        setOpenConnIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
        setTabs((prev) => prev.filter((t) => t.connId !== id));
        refreshConnections();
    }

    async function handleToggleConnection(conn) {
        if (openConnIds.has(conn.id)) {
            await window.api.conn.close(conn.id);
            setOpenConnIds((prev) => {
                const next = new Set(prev);
                next.delete(conn.id);
                return next;
            });
            setTabs((prev) => prev.filter((t) => t.connId !== conn.id));
            return;
        }
        setStatus({type: 'info', message: `Connecting to ${conn.name}...`});
        const result = await window.api.conn.open(conn);
        if (result.ok) {
            setOpenConnIds((prev) => new Set(prev).add(conn.id));
            setStatus(null);
        } else {
            setStatus({type: 'error', message: `Error: ${result.error}`});
        }
    }

    function handleSelectCollection(selection) {
        setTabs((prev) => {
            const existing = prev.find(
                (t) => t.connId === selection.connId && t.dbName === selection.dbName && t.collection === selection.collection
            );
            if (existing) {
                setActiveTabId(existing.id);
                return prev;
            }
            const newTab = {id: `tab-${++tabIdCounter}`, ...selection};
            setActiveTabId(newTab.id);
            return [...prev, newTab];
        });
    }

    function handleCloseTab(tabId) {
        setTabs((prev) => {
            const idx = prev.findIndex((t) => t.id === tabId);
            const next = prev.filter((t) => t.id !== tabId);
            if (activeTabId === tabId) {
                const fallback = next[idx] || next[idx - 1] || next[0];
                setActiveTabId(fallback ? fallback.id : null);
            }
            return next;
        });
    }

    async function handleCollectionContextMenu(e, target) {
        const {connId, dbName, collection} = target;
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            items: [
                {label: 'Open', onClick: () => handleSelectCollection(target)},
                {separator: true},
                {
                    label: 'Export as JSON...',
                    onClick: async () => {
                        const res = await window.api.data.exportCollection({
                            connId,
                            dbName,
                            collection,
                            format: 'json'
                        });
                        if (res.ok) setStatus({
                            type: 'info',
                            message: `Exported ${res.count} document(s) to ${res.filePath}`
                        });
                    }
                },
                {
                    label: 'Export as CSV...',
                    onClick: async () => {
                        const res = await window.api.data.exportCollection({connId, dbName, collection, format: 'csv'});
                        if (res.ok) setStatus({
                            type: 'info',
                            message: `Exported ${res.count} document(s) to ${res.filePath}`
                        });
                    }
                },
                {
                    label: 'Import file into this collection...',
                    onClick: async () => {
                        const res = await window.api.data.importIntoCollection({connId, dbName, collection});
                        if (res.ok) {
                            setStatus({type: 'info', message: `Imported ${res.insertedCount} document(s)`});
                            setReloadSignal((s) => s + 1);
                        }
                    }
                },
                {separator: true},
                {label: 'Copy to another connection...', onClick: () => setCopyDialogSource(target)},
                {separator: true},
                {
                    label: 'Drop collection',
                    danger: true,
                    onClick: async () => {
                        if (!confirm(`Drop collection "${dbName}.${collection}"? This deletes all its documents and cannot be undone.`)) return;
                        await window.api.data.dropCollection({connId, dbName, collection});
                        setTabs((prev) => prev.filter((t) => !(t.connId === connId && t.dbName === dbName && t.collection === collection)));
                        setStatus({type: 'info', message: `Dropped ${dbName}.${collection}`});
                    }
                }
            ]
        });
    }

    function handleConnectionContextMenu(e, conn) {
        const isOpen = openConnIds.has(conn.id);
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            items: [
                {label: isOpen ? 'Disconnect' : 'Connect', onClick: () => handleToggleConnection(conn)},
                {
                    label: 'Edit...',
                    onClick: async () => {
                        const full = await window.api.conn.get(conn.id);
                        setDialogState({open: true, editing: full || conn});
                    }
                },
                {separator: true},
                {
                    label: 'Delete',
                    danger: true,
                    onClick: () => {
                        if (confirm(`Delete connection "${conn.name}"? This cannot be undone.`)) handleDeleteConnection(conn.id);
                    }
                }
            ]
        });
    }

    if (!unlocked) {
        return <VaultGate onUnlocked={() => setUnlocked(true)}/>;
    }

    return (
        <div className="app-root">
            <TitleBar title="MongoStudio"/>
            <div className="app-shell">
                <Sidebar
                    connections={connections}
                    openConnIds={openConnIds}
                    onAddConnection={() => setDialogState({open: true, editing: null})}
                    onEditConnection={async (c) => {
                        const full = await window.api.conn.get(c.id);
                        setDialogState({open: true, editing: full || c});
                    }}
                    onDeleteConnection={handleDeleteConnection}
                    onToggleConnection={handleToggleConnection}
                    onSelectCollection={handleSelectCollection}
                    onOpenSettings={() => setShowSettings(true)}
                    onCollectionContextMenu={handleCollectionContextMenu}
                    onConnectionContextMenu={handleConnectionContextMenu}
                />
                <main className="main-area">
                    {status && <div
                        className={`status-bar ${status.type === 'error' ? 'is-error' : 'is-info'}`}>{status.message}</div>}
                    <div className="collection-tab-bar">
                        {tabs.map((tab) => (
                            <div
                                key={tab.id}
                                className={`collection-tab ${!showSettings && tab.id === activeTabId ? 'active' : ''}`}
                                onClick={() => {
                                    setShowSettings(false);
                                    setActiveTabId(tab.id);
                                }}
                                title={`${tab.dbName}.${tab.collection}`}
                            >
                <span className="collection-tab-label">
                  <span className="collection-tab-db">{tab.dbName}</span>
                  <span className="collection-tab-sep">.</span>
                  <span className="collection-tab-name">{tab.collection}</span>
                </span>
                                <button className="collection-tab-close" onClick={(e) => {
                                    e.stopPropagation();
                                    handleCloseTab(tab.id);
                                }}>×
                                </button>
                            </div>
                        ))}
                        <div className="collection-tab-spacer"/>
                        <div
                            className={`collection-tab settings-tab ${showSettings ? 'active' : ''}`}
                            onClick={() => setShowSettings(true)}
                        >
                            <span className="collection-tab-label">⚙ Settings</span>
                        </div>
                    </div>
                    {showSettings ? (
                        <SettingsPage connections={connections} onImported={refreshConnections}/>
                    ) : tabs.length === 0 ? (
                        <div className="empty-state">
                            <h2>MongoStudio</h2>
                            <p>Select a connection and collection on the left to get started.</p>
                        </div>
                    ) : (
                        tabs.map((tab) => (
                            <div key={tab.id} style={{
                                display: tab.id === activeTabId ? 'flex' : 'none',
                                flex: 1,
                                minWidth: 0,
                                overflow: 'hidden'
                            }}>
                                <CollectionView
                                    selection={tab}
                                    reloadSignal={tab.id === activeTabId ? reloadSignal : undefined}
                                />
                            </div>
                        ))
                    )}
                </main>
                {dialogState.open && (
                    <ConnectionDialog
                        initial={dialogState.editing}
                        onSave={handleSaveConnection}
                        onClose={() => setDialogState({open: false, editing: null})}
                    />
                )}
                {contextMenu && (
                    <ContextMenu
                        x={contextMenu.x}
                        y={contextMenu.y}
                        items={contextMenu.items}
                        onClose={() => setContextMenu(null)}
                    />
                )}
                {copyDialogSource && (
                    <CopyCollectionDialog
                        source={copyDialogSource}
                        openConnections={connections.filter((c) => openConnIds.has(c.id))}
                        onClose={() => setCopyDialogSource(null)}
                        onCopied={() => setReloadSignal((s) => s + 1)}
                    />
                )}
            </div>
        </div>
    );
}