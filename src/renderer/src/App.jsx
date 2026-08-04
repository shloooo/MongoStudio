import React, {useCallback, useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import Sidebar from './components/Sidebar.jsx';
import ConnectionDialog from './components/ConnectionDialog.jsx';
import CollectionView from './components/CollectionView.jsx';
import UsersView from './components/UsersView.jsx';
import ShellConsole from './components/ShellConsole.jsx';
import GridFSBrowser from './components/GridFSBrowser.jsx';
import TitleBar from './components/TitleBar.jsx';
import VaultGate from './components/VaultGate.jsx';
import SetupWizard from './components/SetupWizard.jsx';
import SettingsPage from './components/SettingsPage.jsx';
import ContextMenu from './components/ContextMenu.jsx';
import CopyCollectionDialog from './components/CopyCollectionDialog.jsx';
import CopyDatabaseDialog from './components/CopyDatabaseDialog.jsx';
import ErrorToastStack from './components/ErrorToastStack.jsx';
import SqlExportDialog from './components/SqlExportDialog.jsx';
import JsonCsvExportDialog from './components/JsonCsvExportDialog.jsx';
import BackupDialog from './components/BackupDialog.jsx';
import {reportError} from './lib/errorBus.js';
import {useConfirm, usePrompt} from './components/ConfirmProvider.jsx';
import {useTaskQueue} from './components/TaskQueueProvider.jsx';
import {usePresence} from './lib/usePresence.js';
import './styles.css';

let tabIdCounter = 0;

export default function App() {
    const {t} = useTranslation();
    const [setupNeeded, setSetupNeeded] = useState(null); // null = unknown yet, true/false once checked
    const [unlocked, setUnlocked] = useState(false);
    const [connections, setConnections] = useState([]);
    const [openConnIds, setOpenConnIds] = useState(new Set());
    const [dialogState, setDialogState] = useState({open: false, editing: null});
    // [{ id, kind: 'collection' | 'users' | 'collection-users' | 'settings', connId, dbName, collection }]
    const [tabs, setTabs] = useState([]);
    const [activeTabId, setActiveTabId] = useState(null);
    const [status, setStatus] = useState(null); // { type: 'info' | 'error', message } | null
    const statusPresence = usePresence(status, 180);
    const [closingTabIds, setClosingTabIds] = useState(new Set());
    const [reloadSignal, setReloadSignal] = useState(0);
    const [contextMenu, setContextMenu] = useState(null); // { x, y, items }
    const [copyDialogSource, setCopyDialogSource] = useState(null);
    const [sqlExportSource, setSqlExportSource] = useState(null);
    const [jsonCsvExportSource, setJsonCsvExportSource] = useState(null);
    const [backupSource, setBackupSource] = useState(null);
    const [copyDbDialogSource, setCopyDbDialogSource] = useState(null);
    const [openDbSignal, setOpenDbSignal] = useState(null); // { connId, dbName, force, ts }
    const [settingsSignal, setSettingsSignal] = useState(null); // { category, ts }
    const [refreshDbSignal, setRefreshDbSignal] = useState(null); // { connId, ts }
    const confirmDialog = useConfirm();
    const promptDialog = usePrompt();
    const {enqueue} = useTaskQueue();

    useEffect(() => {
        window.api.setup.needed().then(setSetupNeeded);
    }, []);

    useEffect(() => {
        if (!status || status.action) return;
        const timeout = setTimeout(() => setStatus(null), status.type === 'error' ? 6000 : 3500);
        return () => clearTimeout(timeout);
    }, [status]);

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
        const unsubscribe = window.api.updater.onEvent((payload) => {
            if (payload.type === 'available') {
                setStatus({
                    type: 'info',
                    message: t('app.status.updateAvailable', {version: payload.version}),
                    action: {label: t('app.status.updateOpenSettings'), onClick: () => handleOpenSettings('updates')}
                });
            } else if (payload.type === 'downloaded') {
                setStatus({
                    type: 'info',
                    message: t('app.status.updateDownloaded', {version: payload.version}),
                    action: {label: t('app.status.updateOpenSettings'), onClick: () => handleOpenSettings('updates')}
                });
            }
        });
        return unsubscribe;
    }, [t]);

    useEffect(() => {
        const unsubscribe = window.api.conn.onDisconnected((id) => {
            setOpenConnIds((prev) => {
                if (!prev.has(id)) return prev;
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
            setTabs((prev) => prev.filter((t) => t.connId !== id));
            reportError(t('app.connection.lost'), 'Connection');
        });
        return unsubscribe;
    }, [t]);

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
        setStatus({type: 'info', message: t('app.connection.connecting', {name: conn.name})});
        const result = await window.api.conn.open(conn);
        if (result.ok) {
            setOpenConnIds((prev) => new Set(prev).add(conn.id));
            setStatus(null);
        } else {
            setStatus({type: 'error', message: t('app.connection.error', {error: result.error})});
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
        openTab('collection', {
            connId,
            dbName,
            collection,
            connLabel: getConnName(connId)
        }, `collection:${connId}:${dbName}:${collection}`);
    }

    function handleOpenDatabaseUsers({connId, dbName}) {
        openTab('users', {connId, dbName}, `users:${connId}:${dbName}`);
    }

    function handleOpenCollectionUsers({connId, dbName, collection}) {
        openTab('collection-users', {connId, dbName, collection}, `collection-users:${connId}:${dbName}:${collection}`);
    }

    function handleOpenShell({connId, dbName}) {
        openTab('shell', {connId, dbName, connLabel: getConnName(connId), shellLog: [], shellCmdHistory: []}, `shell:${connId}:${dbName}`);
    }

    function handleOpenGridfs({connId, dbName}) {
        openTab('gridfs', {connId, dbName, connLabel: getConnName(connId)}, `gridfs:${connId}:${dbName}`);
    }

    function updateTab(tabId, patch) {
        setTabs((prev) => prev.map((t) => (t.id === tabId ? {...t, ...(typeof patch === 'function' ? patch(t) : patch)} : t)));
    }

    function handleOpenSettings(category) {
        if (category) setSettingsSignal({category, ts: Date.now()});
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

    function requestCloseTab(tabId) {
        setClosingTabIds((prev) => {
            if (prev.has(tabId)) return prev;
            const next = new Set(prev);
            next.add(tabId);
            return next;
        });
        setTimeout(() => {
            handleCloseTab(tabId);
            setClosingTabIds((prev) => {
                if (!prev.has(tabId)) return prev;
                const next = new Set(prev);
                next.delete(tabId);
                return next;
            });
        }, 150);
    }

    async function handleCollectionContextMenu(e, target) {
        const {connId, dbName, collection} = target;
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            items: [
                {label: t('app.menu.open'), onClick: () => handleSelectCollection(target)},
                {label: t('app.menu.listUsers'), onClick: () => handleOpenCollectionUsers(target)},
                {separator: true},
                {
                    label: t('app.menu.renameCollection'),
                    onClick: async () => {
                        const newName = await promptDialog(t('app.prompts.renameCollection', {collection}), {
                            title: t('app.menu.renameCollection'),
                            confirmLabel: t('app.prompts.rename'),
                            defaultValue: collection
                        });
                        if (!newName || newName === collection) return;
                        try {
                            await window.api.data.renameCollection({connId, dbName, collection, newName});
                            setTabs((prev) => prev.map((t) => (
                                t.connId === connId && t.dbName === dbName && t.collection === collection
                                    ? {...t, collection: newName}
                                    : t
                            )));
                            setStatus({type: 'info', message: t('app.status.renamedCollection', {oldPath: `${dbName}.${collection}`, newPath: `${dbName}.${newName}`})});
                            setOpenDbSignal({connId, dbName, force: true, ts: Date.now()});
                        } catch (err) {
                            setStatus({type: 'error', message: err.message});
                        }
                    }
                },
                {
                    label: t('app.menu.exportSubmenu'),
                    submenu: [
                        {
                            label: t('app.menu.exportJson'),
                            onClick: () => setJsonCsvExportSource({...target, format: 'json'})
                        },
                        {
                            label: t('app.menu.exportCsv'),
                            onClick: () => setJsonCsvExportSource({...target, format: 'csv'})
                        },
                        {
                            label: t('app.menu.exportSql'),
                            onClick: () => setSqlExportSource(target)
                        }
                    ]
                },
                {
                    label: t('app.menu.importFile'),
                    onClick: async () => {
                        const res = await window.api.data.importIntoCollection({connId, dbName, collection});
                        if (res.ok) {
                            setStatus({type: 'info', message: t('app.status.imported', {count: res.insertedCount})});
                            setReloadSignal((s) => s + 1);
                        }
                    }
                },
                {separator: true},
                {label: t('app.menu.copyToConnection'), onClick: () => setCopyDialogSource(target)},
                {separator: true},
                {
                    label: t('app.menu.dropCollection'),
                    danger: true,
                    onClick: async () => {
                        const ok = await confirmDialog(
                            t('app.confirm.dropCollection', {path: `${dbName}.${collection}`}),
                            {title: t('app.confirm.dropCollectionTitle'), confirmLabel: t('app.confirm.drop')}
                        );
                        if (!ok) return;
                        await window.api.data.dropCollection({connId, dbName, collection});
                        setTabs((prev) => prev.filter((t) => !(t.connId === connId && t.dbName === dbName && t.collection === collection)));
                        setStatus({type: 'info', message: t('app.status.droppedCollection', {path: `${dbName}.${collection}`})});
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
                {label: t('app.menu.open'), onClick: () => setOpenDbSignal({connId, dbName, force: false, ts: Date.now()})},
                {separator: true},
                {
                    label: t('app.menu.createCollection'),
                    onClick: async () => {
                        const name = await promptDialog(t('app.prompts.newCollectionName', {dbName}), {
                            title: t('app.menu.createCollection').replace('...', ''),
                            confirmLabel: t('app.prompts.create')
                        });
                        if (!name) return;
                        await window.api.data.createCollection({connId, dbName, collection: name});
                        setStatus({type: 'info', message: t('app.status.createdCollection', {path: `${dbName}.${name}`})});
                        setOpenDbSignal({connId, dbName, force: true, ts: Date.now()});
                    }
                },
                {label: t('app.menu.manageUsers'), onClick: () => handleOpenDatabaseUsers(target)},
                {label: t('app.menu.openShell'), onClick: () => handleOpenShell(target)},
                {label: t('app.menu.openGridfs'), onClick: () => handleOpenGridfs(target)},
                {separator: true},
                {
                    label: t('app.menu.exportJson'),
                    onClick: async () => {
                        const res = await window.api.data.exportDatabase({connId, dbName, format: 'json'});
                        if (res.ok) setStatus({
                            type: 'info',
                            message: t('app.status.exportedMulti', {
                                count: res.count,
                                collectionCount: res.collectionCount,
                                path: res.folderPath
                            })
                        });
                    }
                },
                {
                    label: t('app.menu.exportCsv'),
                    onClick: async () => {
                        const res = await window.api.data.exportDatabase({connId, dbName, format: 'csv'});
                        if (res.ok) setStatus({
                            type: 'info',
                            message: t('app.status.exportedMulti', {
                                count: res.count,
                                collectionCount: res.collectionCount,
                                path: res.folderPath
                            })
                        });
                    }
                },
                {
                    label: t('app.menu.import'),
                    onClick: async () => {
                        const res = await window.api.data.importDatabase({connId, dbName});
                        if (res.ok) {
                            setStatus({
                                type: 'info',
                                message: t('app.status.importedMulti', {
                                    count: res.insertedCount,
                                    collectionCount: res.collectionCount
                                })
                            });
                            setOpenDbSignal({connId, dbName, force: true, ts: Date.now()});
                        }
                    }
                },
                {separator: true},
                {label: t('app.menu.copyToConnection'), onClick: () => setCopyDbDialogSource(target)},
                {separator: true},
                {
                    label: t('app.menu.dropDatabase'),
                    danger: true,
                    onClick: async () => {
                        const ok = await confirmDialog(
                            t('app.confirm.dropDatabase', {name: dbName}),
                            {title: t('app.confirm.dropDatabaseTitle'), confirmLabel: t('app.confirm.drop')}
                        );
                        if (!ok) return;
                        await window.api.data.dropDatabase({connId, dbName});
                        setTabs((prev) => prev.filter((t) => !(t.connId === connId && t.dbName === dbName)));
                        setRefreshDbSignal({connId, ts: Date.now()});
                        setStatus({type: 'info', message: t('app.status.droppedDatabase', {name: dbName})});
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
                {label: isOpen ? t('app.menu.disconnect') : t('app.menu.connect'), onClick: () => handleToggleConnection(conn)},
                {label: t('app.menu.refresh'), disabled: !isOpen, onClick: () => handleRefreshConnection(conn)},
                {
                    label: t('app.menu.edit'),
                    onClick: async () => {
                        const full = await window.api.conn.get(conn.id);
                        setDialogState({open: true, editing: full || conn});
                    }
                },
                {
                    label: t('app.menu.backup'),
                    disabled: !isOpen,
                    onClick: () => setBackupSource({connId: conn.id, connLabel: conn.name})
                },
                {separator: true},
                {
                    label: t('app.menu.createDatabase'),
                    disabled: !isOpen,
                    onClick: async () => {
                        const dbName = await promptDialog(t('app.prompts.newDatabaseName'), {
                            title: t('app.prompts.newDatabaseTitle'),
                            confirmLabel: t('app.prompts.continue')
                        });
                        if (!dbName) return;
                        const collection = await promptDialog(
                            t('app.prompts.firstCollectionName', {dbName}),
                            {title: t('app.prompts.newDatabaseTitle'), confirmLabel: t('app.prompts.create'), defaultValue: 'collection1'}
                        );
                        if (!collection) return;
                        await window.api.conn.createDatabase({connId: conn.id, dbName, collection});
                        setStatus({type: 'info', message: t('app.status.createdDatabase', {name: dbName})});
                        setRefreshDbSignal({connId: conn.id, ts: Date.now()});
                    }
                },
                {separator: true},
                {
                    label: t('app.menu.delete'),
                    danger: true,
                    onClick: async () => {
                        const ok = await confirmDialog(
                            t('app.confirm.deleteConnection', {name: conn.name}),
                            {title: t('app.confirm.deleteConnectionTitle'), confirmLabel: t('app.confirm.drop')}
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
                return t('app.tabs.settings');
            case 'users':
                return t('app.tabLabel.users', {dbName: tab.dbName});
            case 'collection-users':
                return t('app.tabLabel.collectionUsers', {collection: tab.collection});
            case 'shell':
                return t('app.tabLabel.shell', {dbName: tab.dbName});
            case 'gridfs':
                return t('app.tabLabel.gridfs', {dbName: tab.dbName});
            default:
                return tab.collection || tab.dbName;
        }
    }

    function tabTitle(tab) {
        if (tab.kind === 'settings') return t('app.tabs.settings');
        const connName = getConnName(tab.connId);
        switch (tab.kind) {
            case 'users':
                return `${connName} / ${tab.dbName} / users`;
            case 'collection-users':
                return `${connName} / ${tab.dbName} / ${tab.collection} / users`;
            case 'shell':
                return `${connName} / ${tab.dbName} / shell`;
            case 'gridfs':
                return `${connName} / ${tab.dbName} / gridfs`;
            default:
                return `${connName} / ${tab.dbName} / ${tab.collection}`;
        }
    }

    const contentTabs = tabs.filter((t) => t.kind !== 'settings');

    if (setupNeeded === null) {
        return null;
    }

    if (setupNeeded) {
        return (
            <>
                <SetupWizard onComplete={() => setSetupNeeded(false)}/>
                <ErrorToastStack/>
            </>
        );
    }

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
                    {statusPresence.value && <div className={`status-bar ${statusPresence.value.type === 'error' ? 'is-error' : 'is-info'} ${statusPresence.leaving ? 'is-leaving' : ''}`}>
                        <span>{statusPresence.value.message}</span>
                        {statusPresence.value.action && <button className="status-bar-action" onClick={statusPresence.value.action.onClick}>{statusPresence.value.action.label}</button>}
                    </div>}
                    <div className="collection-tab-bar">
                        {tabs.map((tab) => (
                            <div key={tab.id}
                                 className={`collection-tab ${tab.id === activeTabId ? 'active' : ''} ${closingTabIds.has(tab.id) ? 'closing' : ''}`}
                                 onClick={() => setActiveTabId(tab.id)}
                                 title={tabTitle(tab)}>
                                <span className="collection-tab-label">{tabLabel(tab)}</span>
                                <button className="collection-tab-close" onClick={(e) => {
                                    e.stopPropagation();
                                    requestCloseTab(tab.id);
                                }}>×
                                </button>
                            </div>
                        ))}
                    </div>
                    <div className="tab-panel-host">
                        <div className={`tab-panel ${activeTabId === 'settings-tab' ? 'tab-panel-active' : ''}`}>
                            <SettingsPage connections={connections} onImported={refreshConnections} settingsSignal={settingsSignal}/>
                        </div>
                        <div
                            className={`tab-panel ${activeTabId !== 'settings-tab' && contentTabs.length === 0 ? 'tab-panel-active' : ''}`}>
                            <div className="empty-state">
                                <h2>MongoStudio</h2>
                                <p>{t('app.emptyState.body')}</p>
                            </div>
                        </div>
                        {contentTabs.map((tab) => (
                            <div key={tab.id}
                                 className={`tab-panel ${tab.id === activeTabId ? 'tab-panel-active' : ''}`}>
                                {tab.kind === 'users' || tab.kind === 'collection-users' ? (
                                    <UsersView selection={tab}
                                               mode={tab.kind === 'collection-users' ? 'collection' : 'database'}
                                               reloadSignal={tab.id === activeTabId ? reloadSignal : undefined}/>
                                ) : tab.kind === 'shell' ? (
                                    <ShellConsole selection={tab}
                                                  log={tab.shellLog || []}
                                                  onLogChange={(updater) => updateTab(tab.id, (t) => ({shellLog: updater(t.shellLog || [])}))}
                                                  cmdHistory={tab.shellCmdHistory || []}
                                                  onCmdHistoryChange={(updater) => updateTab(tab.id, (t) => ({shellCmdHistory: updater(t.shellCmdHistory || [])}))}/>
                                ) : tab.kind === 'gridfs' ? (
                                    <GridFSBrowser selection={tab}/>
                                ) : (
                                    <CollectionView selection={tab}
                                                    reloadSignal={tab.id === activeTabId ? reloadSignal : undefined}/>
                                )}
                            </div>
                        ))}
                    </div>
                </main>
                {dialogState.open && (
                    <ConnectionDialog
                        initial={dialogState.editing}
                        onSave={handleSaveConnection}
                        onClose={() => setDialogState({open: false, editing: null})}
                    />
                )}
                {contextMenu && (
                    <ContextMenu x={contextMenu.x}
                                 y={contextMenu.y}
                                 items={contextMenu.items}
                                 onClose={() => setContextMenu(null)}/>
                )}
                {copyDialogSource && (
                    <CopyCollectionDialog source={copyDialogSource}
                                          openConnections={connections.filter((c) => openConnIds.has(c.id))}
                                          onClose={() => setCopyDialogSource(null)}
                                          onCopied={() => setReloadSignal((s) => s + 1)}/>
                )}
                {sqlExportSource && (
                    <SqlExportDialog selection={sqlExportSource}
                                     onClose={() => setSqlExportSource(null)}
                                     onExported={(res) => setStatus({type: 'info', message: t('app.status.exported', {count: res.count, path: res.filePath})})}
                                     onQueued={(task, label) => enqueue(task, label, {
                                         onDone: (res) => { if (res?.ok) setStatus({type: 'info', message: t('app.status.exported', {count: res.count, path: res.filePath})}); }
                                     })}/>
                )}
                {jsonCsvExportSource && (
                    <JsonCsvExportDialog selection={jsonCsvExportSource}
                                         onClose={() => setJsonCsvExportSource(null)}
                                         onExported={(res) => setStatus({type: 'info', message: t('app.status.exported', {count: res.count, path: res.filePath})})}
                                         onQueued={(task, label) => enqueue(task, label, {
                                             onDone: (res) => { if (res?.ok) setStatus({type: 'info', message: t('app.status.exported', {count: res.count, path: res.filePath})}); }
                                         })}/>
                )}
                {backupSource && (
                    <BackupDialog connection={backupSource} onClose={() => setBackupSource(null)}/>
                )}
                {copyDbDialogSource && (
                    <CopyDatabaseDialog source={copyDbDialogSource}
                                        openConnections={connections.filter((c) => openConnIds.has(c.id))}
                                        onClose={() => setCopyDbDialogSource(null)}
                                        onCopied={() => setReloadSignal((s) => s + 1)}/>
                )}
            </div>
        </div>
    );
}