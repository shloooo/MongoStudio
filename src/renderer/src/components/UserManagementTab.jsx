import React, {useCallback, useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useConfirm} from './lib/ConfirmProvider.jsx';
import UserEditorDialog from './dialogs/UserEditorDialog.jsx';
import ContextMenu from './lib/ContextMenu.jsx';
import {formatResource, isWildcardResource} from '../lib/mongoPrivileges.js';

const ACTION_PREVIEW_COUNT = 8;

// mode 'database': every user whose authentication database is selection.dbName.
// mode 'collection': every user in the cluster holding a privilege on selection.collection.
export default function UserManagementTab({selection, mode = 'database', reloadSignal}) {
    const {t} = useTranslation();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [editor, setEditor] = useState(null); // { authDb, username } | { authDb } for create
    const [rowContextMenu, setRowContextMenu] = useState(null);
    const confirmDialog = useConfirm();

    const isCollectionMode = mode === 'collection';

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const list = isCollectionMode
                ? await window.api.data.collectionUsers({
                    connId: selection.connId,
                    dbName: selection.dbName,
                    collection: selection.collection
                })
                : await window.api.data.listUsers({connId: selection.connId, dbName: selection.dbName});
            setUsers(list);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [selection.connId, selection.dbName, selection.collection, isCollectionMode]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        if (reloadSignal !== undefined && reloadSignal > 0) load();
    }, [reloadSignal]);

    async function handleDrop(user) {
        setError('');
        const authDb = user.db || selection.dbName;
        const ok = await confirmDialog(t('app.confirm.dropUser', {user: user.user, authDb}), {
            title: t('app.confirm.dropUserTitle'),
            confirmLabel: t('app.confirm.drop')
        });
        if (!ok) return;
        try {
            await window.api.data.dropUser({connId: selection.connId, dbName: authDb, user: user.user});
            load();
        } catch (err) {
            setError(err.message);
        }
    }

    function handleRowContextMenu(e, user) {
        e.preventDefault();
        setRowContextMenu({
            x: e.clientX,
            y: e.clientY,
            items: [
                {
                    label: t('userManagementTab.editUser'),
                    onClick: () => setEditor({authDb: user.db || selection.dbName, username: user.user})
                },
                {separator: true},
                {label: t('app.confirm.dropUserTitle'), danger: true, onClick: () => handleDrop(user)}
            ]
        });
    }

    const emptyText = isCollectionMode
        ? t('userManagementTab.emptyCollection', {path: `${selection.dbName}.${selection.collection}`})
        : t('userManagementTab.emptyDatabase', {dbName: selection.dbName});

    return (
        <div className="users-tab">
            <div className="users-toolbar">
                <span className="results-header">
                    {isCollectionMode
                        ? t('userManagementTab.headerCollection', {path: `${selection.dbName}.${selection.collection}`})
                        : t('userManagementTab.headerDatabase', {dbName: selection.dbName})}
                    {!loading && ` · ${users.length}`}
                </span>
                <div className="spacer"/>
                <button onClick={load} disabled={loading}>{t('userManagementTab.refresh')}</button>
                {!isCollectionMode && (
                    <button className="primary" onClick={() => setEditor({authDb: selection.dbName})}>
                        {t('userManagementTab.createUser')}
                    </button>
                )}
            </div>

            {error && <div className="error-banner">{error}</div>}

            <div className="users-table-wrap">
                {loading ? (
                    <UsersTableSkeleton isCollectionMode={isCollectionMode}/>
                ) : (
                    <table className="users-table">
                        <thead>
                        <tr>
                            <th className="col-user">{t('userManagementTab.col.user')}</th>
                            <th className="col-authdb">{t('userManagementTab.col.auth-db')}</th>
                            <th className="col-roles">{t('userManagementTab.col.roles')}</th>
                            {isCollectionMode ? (
                                <>
                                    <th className="col-granted">{t('userManagementTab.col.granted')}</th>
                                    <th className="col-actions-list">{t('userManagementTab.col.actions')}</th>
                                </>
                            ) : (
                                <th className="col-mechanisms">{t('userManagementTab.col.mechanisms')}</th>
                            )}
                        </tr>
                        </thead>
                        <tbody>
                        {users.map((u) => (
                                    <tr key={`${u.db}.${u.user}`} onContextMenu={(e) => handleRowContextMenu(e, u)}>
                                        <td className="col-user"><span className="user-name">{u.user}</span></td>
                                        <td className="col-authdb"><code>{u.db}</code></td>
                                        <td className="col-roles"><RoleChips roles={u.roles}/></td>
                                        {isCollectionMode ? (
                                            <>
                                                <td className="col-granted"><ResourceChips resources={u.resources}/></td>
                                                <td className="col-actions-list"><ActionChips actions={u.actions}/></td>
                                            </>
                                        ) : (
                                            <td className="col-mechanisms">
                                                <span className="muted-text">{(u.mechanisms || []).join(', ') || '—'}</span>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                        {users.length === 0 && !loading && (
                            <tr>
                                <td colSpan="4" className="tree-empty">{emptyText}</td>
                            </tr>
                        )}
                        </tbody>
                    </table>
                )}
            </div>

            {editor && (
                <UserEditorDialog
                    connId={selection.connId}
                    authDb={editor.authDb}
                    username={editor.username}
                    onClose={() => setEditor(null)}
                    onSaved={() => {
                        setEditor(null);
                        load();
                    }}
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
        </div>
    );
}

function UsersTableSkeleton({isCollectionMode}) {
    return (
        <table className="users-table">
            <tbody>
            {[0, 1, 2, 3, 4, 5].map((i) => (
                <tr key={i}>
                    <td className="col-user"><div className="skeleton-line" style={{width: '90px', height: '12px'}}/></td>
                    <td className="col-authdb"><div className="skeleton-line" style={{width: '60px', height: '12px'}}/></td>
                    <td className="col-roles"><div className="skeleton-line" style={{width: '140px', height: '12px'}}/></td>
                    {isCollectionMode ? (
                        <>
                            <td className="col-granted"><div className="skeleton-line" style={{width: '110px', height: '12px'}}/></td>
                            <td className="col-actions-list"><div className="skeleton-line" style={{width: '160px', height: '12px'}}/></td>
                        </>
                    ) : (
                        <td className="col-mechanisms"><div className="skeleton-line" style={{width: '80px', height: '12px'}}/></td>
                    )}
                </tr>
            ))}
            </tbody>
        </table>
    );
}

function RoleChips({roles}) {
    const {t} = useTranslation();
    if (!roles || roles.length === 0) return <span className="muted-text">{t('userManagementTab.noRoles')}</span>;
    return (
        <div className="chip-row">
            {roles.map((r) => (
                <span className="role-chip" key={`${r.role}@${r.db}`}>
                    {r.role}<span className="role-chip-db">@{r.db}</span>
                </span>
            ))}
        </div>
    );
}

function ResourceChips({resources}) {
    const {t} = useTranslation();
    if (!resources || resources.length === 0) return <span className="muted-text">&mdash;</span>;
    const labels = Array.from(new Map(
        resources.map((r) => [formatResource(r), {label: formatResource(r), wildcard: isWildcardResource(r)}])
    ).values());
    return (
        <div className="chip-row">
            {labels.map((l) => (
                <span className={`resource-chip ${l.wildcard ? 'is-wildcard' : ''}`} key={l.label}
                      title={l.wildcard ? t('userManagementTab.wildcardHint') : undefined}>
                    {l.label}
                </span>
            ))}
        </div>
    );
}

function ActionChips({actions}) {
    const {t} = useTranslation();
    const [expanded, setExpanded] = useState(false);
    if (!actions || actions.length === 0) return <span className="muted-text">&mdash;</span>;
    const shown = expanded ? actions : actions.slice(0, ACTION_PREVIEW_COUNT);
    const hidden = actions.length - shown.length;
    return (
        <div className="chip-row">
            {shown.map((a) => <span className="action-chip" key={a}>{a}</span>)}
            {hidden > 0 && (
                <button type="button" className="chip-more"
                        onClick={() => setExpanded(true)}>{t('userManagementTab.moreCount', {count: hidden})}</button>
            )}
            {expanded && actions.length > ACTION_PREVIEW_COUNT && (
                <button type="button" className="chip-more"
                        onClick={() => setExpanded(false)}>{t('userManagementTab.showLess')}</button>
            )}
        </div>
    );
}