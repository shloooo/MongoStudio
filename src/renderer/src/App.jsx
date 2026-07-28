import React, {useCallback, useEffect, useState} from 'react';
import Sidebar from './components/Sidebar.jsx';
import ConnectionDialog from './components/ConnectionDialog.jsx';
import CollectionView from './components/CollectionView.jsx';
import UsersView from './components/UsersView.jsx';
import TitleBar from './components/TitleBar.jsx';
import VaultGate from './components/VaultGate.jsx';
import SettingsPage from './components/SettingsPage.jsx';
import ContextMenu from './components/ContextMenu.jsx';
import CopyCollectionDialog from './components/CopyCollectionDialog.jsx';
import CopyDatabaseDialog from './components/CopyDatabaseDialog.jsx';
import ErrorToastStack from './components/ErrorToastStack.jsx';
import {reportError} from './lib/errorBus.js';
import {useConfirm, usePrompt} from './components/ConfirmProvider.jsx';
import './styles.css';

let tabIdCounter = 0;

export default function App() {
    const [unlocked, setUnlocked] = useState(false);
    const [connections, setConnections] = useState([]);
    const [openConnIds, setOpenConnIds] = useState(new Set());
    const [dialogState, setDialogState] = useState({open: false, editing: null});
    // [{ id, kind: 'collection' | 'users' | 'collection-users' | 'settings', connId, dbName, collection }]
    const [tabs, setTabs] = useState([]);
    const [activeTabId, setActiveTabId] = useState(null);
    const [status, setStatus] = useState(null); // { type: 'info' | 'error', message } | null
    const [reloadSignal, setReloadSignal] = useState(0);
    const [contextMenu, setContextMenu] = useState(null); // { x, y, items }
    const [copyDialogSource, setCopyDialogSource] = useState(null);
    const [copyDbDialogSource, setCopyDbDialogSource] = useState(null);
    const [openDbSignal, setOpenDbSignal] = useState(null); // { connId, dbName, force, ts }
    const [refreshDbSignal, setRefreshDbSignal] = useState(null); // { connId, ts }
    const confirmDialog = useConfirm();
    const promptDialog = usePrompt();

    useEffect(() => {
        const unsubscribeMain = window.api.app.onError((message) => {
            reportError(message, 'Main process');
        });

        function handleWindowError(event) {
            reportError(event.error?.message || event.message, 'Renderer');
        }

        function handleUnhandledRejection(event) {
            const reason = event.reason;
            reportError(reason?.message || String(reason), 'Renderer');
        }

        window.addEventListener('error', handleWindowError);
        window.addEventListener('unhandledrejection', handleUnhandledRejection);
        return () => {
            unsubscribeMain();
            window.removeEventListener('error', handleWindowError);
            window.removeEventListener('unhandledrejection', handleUnhandledRejection);
        };
    }, []);

    useEffect(() => {
        const unsubscribe = window.api.conn.onDisconnected((id) => {
            setOpenConnIds((prev) => {
                if (!prev.has(id)) return prev;
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
            setTabs((prev) => prev.filter((t) => t.connId !== id));
            reportError('Connection lost. Please reconnect.', 'Connection');
        });
        return unsubscribe;
    }, []);

    const refreshConnections = useCallback(async () => {
        const list = await window.api.conn.list();
        setConnections(list);
    }, []);

    useEffect(() => {
        if (unlocked) refreshConnections();
    }, [unlocked, refreshConnections]);

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

    function openTab(kind, target, key) {
        setTabs((prev) => {
            const existing = prev.find((t) => t.key === key);
            if (existing) {
                setActiveTabId(existing.id);
                return prev;
            }
            const newTab = {id: `tab-${++tabIdCounter}`, key, kind, ...target};
            setActiveTabId(newTab.id);
            return [...prev, newTab];
        });
    }

    function handleSelectCollection(selection) {
        const {connId, dbName, collection} = selection;
        openTab('collection', {connId, dbName, collection}, `collection:${connId}:${dbName}:${collection}`);
    }

    function handleOpenDatabaseUsers({connId, dbName}) {
        openTab('users', {connId, dbName}, `users:${connId}:${dbName}`);
    }

    function handleOpenCollectionUsers({connId, dbName, collection}) {
        openTab('collection-users', {connId, dbName, collection}, `collection-users:${connId}:${dbName}:${collection}`);
    }

    function handleOpenSettings() {
        setTabs((prev) => {
            if (prev.some((t) => t.kind === 'settings')) return prev;
            return [...prev, {id: 'settings-tab', key: 'settings', kind: 'settings'}];
        });
        setActiveTabId('settings-tab');
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
                {label: 'List users with access...', onClick: () => handleOpenCollectionUsers(target)},
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
                        const ok = await confirmDialog(
                            `Drop collection "${dbName}.${collection}"? This deletes all its documents and cannot be undone.`,
                            {title: 'Drop collection', confirmLabel: 'Drop'}
                        );
                        if (!ok) return;
                        await window.api.data.dropCollection({connId, dbName, collection});
                        setTabs((prev) => prev.filter((t) => !(t.connId === connId && t.dbName === dbName && t.collection === collection)));
                        setStatus({type: 'info', message: `Dropped ${dbName}.${collection}`});
                    }
                }
            ]
        });
    }

    async function handleDatabaseContextMenu(e, target) {
        const {connId, dbName} = target;
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            items: [
                {label: 'Open', onClick: () => setOpenDbSignal({connId, dbName, force: false, ts: Date.now()})},
                {separator: true},
                {
                    label: 'Create collection...',
                    onClick: async () => {
                        const name = await promptDialog(`New collection name in "${dbName}":`, {
                            title: 'Create collection',
                            confirmLabel: 'Create'
                        });
                        if (!name) return;
                        await window.api.data.createCollection({connId, dbName, collection: name});
                        setStatus({type: 'info', message: `Created collection ${dbName}.${name}`});
                        setOpenDbSignal({connId, dbName, force: true, ts: Date.now()});
                    }
                },
                {label: 'Manage users...', onClick: () => handleOpenDatabaseUsers(target)},
                {separator: true},
                {
                    label: 'Export as JSON...',
                    onClick: async () => {
                        const res = await window.api.data.exportDatabase({connId, dbName, format: 'json'});
                        if (res.ok) setStatus({
                            type: 'info',
                            message: `Exported ${res.count} document(s) across ${res.collectionCount} collection(s) to ${res.folderPath}`
                        });
                    }
                },
                {
                    label: 'Export as CSV...',
                    onClick: async () => {
                        const res = await window.api.data.exportDatabase({connId, dbName, format: 'csv'});
                        if (res.ok) setStatus({
                            type: 'info',
                            message: `Exported ${res.count} document(s) across ${res.collectionCount} collection(s) to ${res.folderPath}`
                        });
                    }
                },
                {
                    label: 'Import...',
                    onClick: async () => {
                        const res = await window.api.data.importDatabase({connId, dbName});
                        if (res.ok) {
                            setStatus({
                                type: 'info',
                                message: `Imported ${res.insertedCount} document(s) into ${res.collectionCount} collection(s)`
                            });
                            setOpenDbSignal({connId, dbName, force: true, ts: Date.now()});
                        }
                    }
                },
                {separator: true},
                {label: 'Copy to another connection...', onClick: () => setCopyDbDialogSource(target)},
                {separator: true},
                {
                    label: 'Drop database',
                    danger: true,
                    onClick: async () => {
                        const ok = await confirmDialog(
                            `Drop database "${dbName}"? This deletes all its collections and cannot be undone.`,
                            {title: 'Drop database', confirmLabel: 'Drop'}
                        );
                        if (!ok) return;
                        await window.api.data.dropDatabase({connId, dbName});
                        setTabs((prev) => prev.filter((t) => !(t.connId === connId && t.dbName === dbName)));
                        setRefreshDbSignal({connId, ts: Date.now()});
                        setStatus({type: 'info', message: `Dropped database ${dbName}`});
                    }
                }
            ]
        });
    }

    function handleRefreshConnection(conn) {
        setRefreshDbSignal({connId: conn.id, ts: Date.now()});
    }

    function handleConnectionContextMenu(e, conn) {
        const isOpen = openConnIds.has(conn.id);
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            items: [
                {label: isOpen ? 'Disconnect' : 'Connect', onClick: () => handleToggleConnection(conn)},
                {label: 'Refresh', disabled: !isOpen, onClick: () => handleRefreshConnection(conn)},
                {
                    label: 'Edit...',
                    onClick: async () => {
                        const full = await window.api.conn.get(conn.id);
                        setDialogState({open: true, editing: full || conn});
                    }
                },
                {separator: true},
                {
                    label: 'Create database...',
                    disabled: !isOpen,
                    onClick: async () => {
                        const dbName = await promptDialog('New database name:', {
                            title: 'Create database',
                            confirmLabel: 'Continue'
                        });
                        if (!dbName) return;
                        const collection = await promptDialog(
                            `Databases only exist once they hold a collection. Name for the first collection in "${dbName}":`,
                            {title: 'Create database', confirmLabel: 'Create', defaultValue: 'collection1'}
                        );
                        if (!collection) return;
                        await window.api.conn.createDatabase({connId: conn.id, dbName, collection});
                        setStatus({type: 'info', message: `Created database ${dbName}`});
                        setRefreshDbSignal({connId: conn.id, ts: Date.now()});
                    }
                },
                {
                    label: 'Manage users (admin)...',
                    disabled: !isOpen,
                    onClick: () => handleOpenDatabaseUsers({connId: conn.id, dbName: 'admin'})
                },
                {separator: true},
                {
                    label: 'Delete',
                    danger: true,
                    onClick: async () => {
                        const ok = await confirmDialog(
                            `Delete connection "${conn.name}"? This cannot be undone.`,
                            {title: 'Delete connection', confirmLabel: 'Delete'}
                        );
                        if (ok) handleDeleteConnection(conn.id);
                    }
                }
            ]
        });
    }

    function getConnName(connId) {
        return connections.find((c) => c.id === connId)?.name || connId;
    }

    function tabLabel(tab) {
        switch (tab.kind) {
            case 'settings':
                return 'Settings';
            case 'users':
                return `${tab.dbName} users`;
            case 'collection-users':
                return `${tab.collection} users`;
            default:
                return tab.collection || tab.dbName;
        }
    }

    function tabTitle(tab) {
        if (tab.kind === 'settings') return 'Settings';
        const connName = getConnName(tab.connId);
        switch (tab.kind) {
            case 'users':
                return `${connName} / ${tab.dbName} / users`;
            case 'collection-users':
                return `${connName} / ${tab.dbName} / ${tab.collection} / users`;
            default:
                return `${connName} / ${tab.dbName} / ${tab.collection}`;
        }
    }

    const contentTabs = tabs.filter((t) => t.kind !== 'settings');

    if (!unlocked) {
        return (
            <>
                <VaultGate onUnlocked={() => setUnlocked(true)}/>
                <ErrorToastStack/>
            </>
        );
    }

    return (
        <div className="app-root">
            <TitleBar title="MongoStudio"/>
            <ErrorToastStack/>
            <div className="app-shell">
                <Sidebar connections={connections}
                         openConnIds={openConnIds}
                         onAddConnection={() => setDialogState({open: true, editing: null})}
                         onEditConnection={async (c) => {
                             const full = await window.api.conn.get(c.id);
                             setDialogState({open: true, editing: full || c});
                         }}
                         onDeleteConnection={handleDeleteConnection}
                         onToggleConnection={handleToggleConnection}
                         onRefreshConnection={handleRefreshConnection}
                         onSelectCollection={handleSelectCollection}
                         onOpenSettings={handleOpenSettings}
                         onCollectionContextMenu={handleCollectionContextMenu}
                         onConnectionContextMenu={handleConnectionContextMenu}
                         onDatabaseContextMenu={handleDatabaseContextMenu}
                         openDbSignal={openDbSignal}
                         refreshDbSignal={refreshDbSignal}
                />
                <main className="main-area">
                    {status && <div
                        className={`status-bar ${status.type === 'error' ? 'is-error' : 'is-info'}`}>{status.message}</div>}
                    <div className="collection-tab-bar">
                        {tabs.map((tab) => (
                            <div key={tab.id}
                                 className={`collection-tab ${tab.id === activeTabId ? 'active' : ''}`}
                                 onClick={() => setActiveTabId(tab.id)}
                                 title={tabTitle(tab)}>
                                <span className="collection-tab-label">{tabLabel(tab)}</span>
                                <button className="collection-tab-close" onClick={(e) => {
                                    e.stopPropagation();
                                    handleCloseTab(tab.id);
                                }}>×
                                </button>
                            </div>
                        ))}
                    </div>
                    {activeTabId === 'settings-tab' ? (
                        <SettingsPage connections={connections} onImported={refreshConnections}/>
                    ) : contentTabs.length === 0 ? (
                        <div className="empty-state">
                            <h2>MongoStudio</h2>
                            <p>Select a connection and collection on the left to get started.</p>
                        </div>
                    ) : (
                        contentTabs.map((tab) => (
                            <div key={tab.id} style={{
                                display: tab.id === activeTabId ? 'flex' : 'none',
                                flex: 1,
                                minWidth: 0,
                                overflow: 'hidden'
                            }}>
                                {tab.kind === 'users' || tab.kind === 'collection-users' ? (
                                    <UsersView
                                        selection={tab}
                                        mode={tab.kind === 'collection-users' ? 'collection' : 'database'}
                                        reloadSignal={tab.id === activeTabId ? reloadSignal : undefined}
                                    />
                                ) : (
                                    <CollectionView
                                        selection={tab}
                                        reloadSignal={tab.id === activeTabId ? reloadSignal : undefined}
                                    />
                                )}
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
                {copyDbDialogSource && (
                    <CopyDatabaseDialog
                        source={copyDbDialogSource}
                        openConnections={connections.filter((c) => openConnIds.has(c.id))}
                        onClose={() => setCopyDbDialogSource(null)}
                        onCopied={() => setReloadSignal((s) => s + 1)}
                    />
                )}
            </div>
        </div>
    );
}