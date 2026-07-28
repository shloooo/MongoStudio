import React, {useCallback, useEffect, useState} from 'react';
import {parseShell} from '../lib/shellSyntax.js';
import {useConfirm} from './ConfirmProvider.jsx';

function formatRoles(roles) {
    return (roles || []).map((r) => `${r.role}@${r.db}`).join(', ');
}

export default function UserManagementTab({selection, reloadSignal}) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const confirmDialog = useConfirm();

    const [newUser, setNewUser] = useState('');
    const [newPwd, setNewPwd] = useState('');
    const [newRoles, setNewRoles] = useState(`[{role: 'readWrite', db: '${selection.dbName}'}]`);

    const [editingUser, setEditingUser] = useState(null);
    const [editPwd, setEditPwd] = useState('');
    const [editRoles, setEditRoles] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const list = await window.api.data.listUsers({connId: selection.connId, dbName: selection.dbName});
            setUsers(list);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [selection]);

    useEffect(() => {
        load();
    }, [load]);
    useEffect(() => {
        if (reloadSignal !== undefined && reloadSignal > 0) load();
    }, [reloadSignal]);

    async function handleCreate() {
        setError('');
        if (!newUser.trim()) {
            setError('Username is required.');
            return;
        }
        if (!newPwd) {
            setError('Password is required.');
            return;
        }
        try {
            const roles = parseShell(newRoles);
            if (!Array.isArray(roles)) throw new Error('Roles must be an array, e.g. [{role: "readWrite", db: "mydb"}]');
            await window.api.data.createUser({
                connId: selection.connId,
                dbName: selection.dbName,
                user: newUser.trim(),
                pwd: newPwd,
                roles
            });
            setNewUser('');
            setNewPwd('');
            load();
        } catch (err) {
            setError(err.message);
        }
    }

    function startEdit(u) {
        setError('');
        setEditingUser(u.user);
        setEditPwd('');
        setEditRoles(JSON.stringify((u.roles || []).map((r) => ({role: r.role, db: r.db}))));
    }

    function cancelEdit() {
        setEditingUser(null);
        setEditPwd('');
        setEditRoles('');
    }

    async function handleSaveEdit() {
        setError('');
        try {
            const payload = {connId: selection.connId, dbName: selection.dbName, user: editingUser};
            if (editPwd) payload.pwd = editPwd;
            if (editRoles.trim()) {
                const roles = parseShell(editRoles);
                if (!Array.isArray(roles)) throw new Error('Roles must be an array, e.g. [{role: "readWrite", db: "mydb"}]');
                payload.roles = roles;
            }
            await window.api.data.updateUser(payload);
            cancelEdit();
            load();
        } catch (err) {
            setError(err.message);
        }
    }

    async function handleDrop(username) {
        setError('');
        const ok = await confirmDialog(`Drop user "${username}"? This cannot be undone.`, {
            title: 'Drop user',
            confirmLabel: 'Drop'
        });
        if (!ok) return;
        try {
            await window.api.data.dropUser({connId: selection.connId, dbName: selection.dbName, user: username});
            load();
        } catch (err) {
            setError(err.message);
        }
    }

    return (
        <div className="users-tab">
            {error && <div className="error-banner">{error}</div>}

            {loading ? (
                <div className="tree-loading">loading...</div>
            ) : (
                <table className="doc-table">
                    <thead>
                    <tr>
                        <th>User</th>
                        <th>Roles</th>
                        <th></th>
                    </tr>
                    </thead>
                    <tbody>
                    {users.length === 0 && (
                        <tr>
                            <td colSpan={3} className="tree-empty">No users defined on {selection.dbName}.</td>
                        </tr>
                    )}
                    {users.map((u) => (
                        <tr key={u.user}>
                            <td>{u.user}</td>
                            <td>
                                {editingUser === u.user ? (
                                    <input value={editRoles} onChange={(e) => setEditRoles(e.target.value)}
                                           placeholder="Roles (leave to keep unchanged)"/>
                                ) : (
                                    <code>{formatRoles(u.roles)}</code>
                                )}
                            </td>
                            <td>
                                {editingUser === u.user ? (
                                    <div className="row">
                                        <input
                                            type="password"
                                            placeholder="New password (optional)"
                                            value={editPwd}
                                            onChange={(e) => setEditPwd(e.target.value)}
                                        />
                                        <button className="primary" onClick={handleSaveEdit}>Save</button>
                                        <button onClick={cancelEdit}>Cancel</button>
                                    </div>
                                ) : (
                                    <div className="row-actions">
                                        <button title="Edit" onClick={() => startEdit(u)}>✎</button>
                                        <button title="Drop" className="delete-icon-btn"
                                                onClick={() => handleDrop(u.user)}>
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
                                )}
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            )}

            <div className="new-index-form">
                <h4>Create New User</h4>
                <div className="row">
                    <div>
                        <label>Username</label>
                        <input value={newUser} onChange={(e) => setNewUser(e.target.value)}/>
                    </div>
                    <div>
                        <label>Password</label>
                        <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)}/>
                    </div>
                    <div>
                        <label>Roles</label>
                        <input value={newRoles} onChange={(e) => setNewRoles(e.target.value)}/>
                    </div>
                </div>
                <button className="primary" onClick={handleCreate}>Create User</button>
            </div>
        </div>
    );
}
