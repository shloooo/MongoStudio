import React, {useCallback, useEffect, useState} from 'react';
import {useConfirm} from './ConfirmProvider.jsx';
import UserEditorDialog from './UserEditorDialog.jsx';
import {formatResource, isWildcardResource} from '../lib/mongoPrivileges.js';

const ACTION_PREVIEW_COUNT = 8;

// mode 'database': every user whose authentication database is selection.dbName.
// mode 'collection': every user in the cluster holding a privilege on selection.collection.
export default function UserManagementTab({selection, mode = 'database', reloadSignal}) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [editor, setEditor] = useState(null); // { authDb, username } | { authDb } for create
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
        const ok = await confirmDialog(`Drop user "${user.user}" from "${authDb}"? This cannot be undone.`, {
            title: 'Drop user',
            confirmLabel: 'Drop'
        });
        if (!ok) return;
        try {
            await window.api.data.dropUser({connId: selection.connId, dbName: authDb, user: user.user});
            load();
        } catch (err) {
            setError(err.message);
        }
    }

    const emptyText = isCollectionMode
        ? `No user has explicit privileges on ${selection.dbName}.${selection.collection}.`
        : `No users are defined on "${selection.dbName}".`;

    return (
        <div className="users-tab">
            <div className="users-toolbar">
                <span className="results-header">
                    {isCollectionMode
                        ? `Users with access to ${selection.dbName}.${selection.collection}`
                        : `Users on ${selection.dbName}`}
                    {!loading && ` · ${users.length}`}
                </span>
                <div className="spacer"/>
                <button onClick={load} disabled={loading}>Refresh</button>
                {!isCollectionMode && (
                    <button className="primary" onClick={() => setEditor({authDb: selection.dbName})}>
                        + Create user
                    </button>
                )}
            </div>

            {error && <div className="error-banner">{error}</div>}

            <div className="users-table-wrap">
                {loading ? (
                    <div className="tree-loading">loading...</div>
                ) : users.length === 0 ? (
                    <div className="tree-empty">{emptyText}</div>
                ) : (
                    <table className="users-table">
                        <thead>
                        <tr>
                            <th className="col-user">User</th>
                            <th className="col-authdb">Auth DB</th>
                            <th className="col-roles">Roles</th>
                            {isCollectionMode ? (
                                <>
                                    <th className="col-granted">Granted on</th>
                                    <th className="col-actions-list">Allowed actions</th>
                                </>
                            ) : (
                                <th className="col-mechanisms">Mechanisms</th>
                            )}
                            <th className="col-row-actions"/>
                        </tr>
                        </thead>
                        <tbody>
                        {users.map((u) => (
                            <tr key={`${u.db}.${u.user}`}>
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
                                <td className="col-row-actions">
                                    <div className="row-actions is-static">
                                        <button title="Edit user"
                                                onClick={() => setEditor({
                                                    authDb: u.db || selection.dbName,
                                                    username: u.user
                                                })}>✎
                                        </button>
                                        <button title="Drop user"
                                                className="delete-icon-btn"
                                                onClick={() => handleDrop(u)}>
                                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                                                <path
                                                    d="M2 4h12M6.5 4V2.5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1V4M12.5 4l-.6 9.4a1 1 0 0 1-1 .9H5.1a1 1 0 0 1-1-.9L3.5 4"
                                                    stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"
                                                    strokeLinejoin="round"/>
                                                <path d="M6.5 7v4M9.5 7v4" stroke="currentColor" strokeWidth="1.3"
                                                      strokeLinecap="round"/>
                                            </svg>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
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
        </div>
    );
}

function RoleChips({roles}) {
    if (!roles || roles.length === 0) return <span className="muted-text">no roles</span>;
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
    if (!resources || resources.length === 0) return <span className="muted-text">&mdash;</span>;
    const labels = Array.from(new Map(
        resources.map((r) => [formatResource(r), {label: formatResource(r), wildcard: isWildcardResource(r)}])
    ).values());
    return (
        <div className="chip-row">
            {labels.map((l) => (
                <span className={`resource-chip ${l.wildcard ? 'is-wildcard' : ''}`} key={l.label}
                      title={l.wildcard ? 'Wildcard - also covers collections created later' : undefined}>
                    {l.label}
                </span>
            ))}
        </div>
    );
}

function ActionChips({actions}) {
    const [expanded, setExpanded] = useState(false);
    if (!actions || actions.length === 0) return <span className="muted-text">&mdash;</span>;
    const shown = expanded ? actions : actions.slice(0, ACTION_PREVIEW_COUNT);
    const hidden = actions.length - shown.length;
    return (
        <div className="chip-row">
            {shown.map((a) => <span className="action-chip" key={a}>{a}</span>)}
            {hidden > 0 && (
                <button type="button" className="chip-more" onClick={() => setExpanded(true)}>+{hidden} more</button>
            )}
            {expanded && actions.length > ACTION_PREVIEW_COUNT && (
                <button type="button" className="chip-more" onClick={() => setExpanded(false)}>show less</button>
            )}
        </div>
    );
}
