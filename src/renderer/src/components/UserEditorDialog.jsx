import React, {useEffect, useMemo, useState} from 'react';
import {groupPrivilegesByResource, sameRole} from '../lib/mongoPrivileges.js';

export default function UserEditorDialog({connId, authDb, username, onClose, onSaved}) {
    const isCreate = !username;

    const [loading, setLoading] = useState(!isCreate);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const [newUsername, setNewUsername] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [roles, setRoles] = useState([]);
    const [privileges, setPrivileges] = useState([]);
    const [mechanisms, setMechanisms] = useState([]);

    const [databases, setDatabases] = useState([]);
    const [rolesByDb, setRolesByDb] = useState({});

    useEffect(() => {
        window.api.conn.listDatabases(connId)
            .then((dbs) => setDatabases(dbs.map((d) => d.name).sort((a, b) => a.localeCompare(b))))
            .catch(() => setDatabases([authDb]));
    }, [connId, authDb]);

    useEffect(() => {
        if (isCreate) {
            setRoles([{role: 'readWrite', db: authDb}]);
            return;
        }
        let cancelled = false;
        setLoading(true);
        window.api.data.userPrivileges({connId, dbName: authDb, user: username})
            .then((detail) => {
                if (cancelled) return;
                setRoles(detail.roles.map((r) => ({role: r.role, db: r.db})));
                setPrivileges(detail.privileges);
                setMechanisms(detail.mechanisms);
            })
            .catch((err) => {
                if (!cancelled) setError(err.message);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [connId, authDb, username, isCreate]);

    const neededDbs = useMemo(
        () => Array.from(new Set([authDb, ...roles.map((r) => r.db)].filter(Boolean))),
        [authDb, roles]
    );

    useEffect(() => {
        const missing = neededDbs.filter((db) => !(db in rolesByDb));
        if (!missing.length) return;
        let cancelled = false;
        Promise.all(missing.map(async (db) => {
            try {
                return [db, await window.api.data.listRoles({connId, dbName: db})];
            } catch {
                return [db, []];
            }
        })).then((entries) => {
            if (!cancelled) setRolesByDb((prev) => ({...prev, ...Object.fromEntries(entries)}));
        });
        return () => {
            cancelled = true;
        };
    }, [connId, neededDbs, rolesByDb]);

    function updateRole(index, patch) {
        setRoles((prev) => prev.map((r, i) => (i === index ? {...r, ...patch} : r)));
    }

    function addRole() {
        setRoles((prev) => [...prev, {role: '', db: authDb}]);
    }

    function removeRole(index) {
        setRoles((prev) => prev.filter((_, i) => i !== index));
    }

    async function handleSave() {
        setError('');
        if (roles.some((r) => !r.role || !r.db)) {
            setError('Every role needs both a role name and a database.');
            return;
        }
        if (roles.some((r, i) => roles.findIndex((other) => sameRole(other, r)) !== i)) {
            setError('The same role is assigned twice.');
            return;
        }
        if ((password || passwordConfirm) && password !== passwordConfirm) {
            setError('Passwords do not match.');
            return;
        }
        if (isCreate && !newUsername.trim()) {
            setError('Username is required.');
            return;
        }
        if (isCreate && !password) {
            setError('Password is required.');
            return;
        }

        setSaving(true);
        try {
            if (isCreate) {
                await window.api.data.createUser({
                    connId,
                    dbName: authDb,
                    user: newUsername.trim(),
                    pwd: password,
                    roles
                });
            } else {
                const payload = {connId, dbName: authDb, user: username, roles};
                if (password) payload.pwd = password;
                await window.api.data.updateUser(payload);
            }
            onSaved();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    }

    const groupedPrivileges = useMemo(() => groupPrivilegesByResource(privileges), [privileges]);
    const dbOptions = databases.length ? databases : [authDb];

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal wide user-editor" onClick={(e) => e.stopPropagation()}>
                <h3>{isCreate ? 'Create user' : `Edit user "${username}"`}</h3>
                <p className="hint-text">
                    Authentication database: <strong>{authDb}</strong>
                    {mechanisms.length > 0 && <> &middot; mechanisms: {mechanisms.join(', ')}</>}
                </p>

                {error && <div className="error-banner">{error}</div>}

                {loading ? (
                    <div className="tree-loading">loading...</div>
                ) : (
                    <>
                        {isCreate && (
                            <div className="user-editor-field">
                                <label>Username</label>
                                <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} autoFocus/>
                            </div>
                        )}

                        <div className="user-editor-section">
                            <div className="user-editor-section-head">
                                <h4>Password</h4>
                            </div>
                            <p className="hint-text">
                                {isCreate ? 'Required.' : 'Leave both fields empty to keep the current password.'}
                            </p>
                            <div className="row">
                                <div>
                                    <label>{isCreate ? 'Password' : 'New password'}</label>
                                    <input type="password"
                                           value={password}
                                           autoComplete="new-password"
                                           onChange={(e) => setPassword(e.target.value)}/>
                                </div>
                                <div>
                                    <label>Confirm password</label>
                                    <input type="password"
                                           value={passwordConfirm}
                                           autoComplete="new-password"
                                           onChange={(e) => setPasswordConfirm(e.target.value)}/>
                                </div>
                            </div>
                        </div>

                        <div className="user-editor-section">
                            <div className="user-editor-section-head">
                                <h4>Roles</h4>
                                <button type="button" onClick={addRole}>+ Add role</button>
                            </div>
                            <p className="hint-text">
                                Roles decide what the user may do. Pick the database each role applies to &mdash; a role
                                on <code>admin</code> applies cluster-wide.
                            </p>
                            {roles.length === 0 ? (
                                <div className="tree-empty">No roles assigned. This user cannot access any data.</div>
                            ) : (
                                <div className="role-editor-list">
                                    {roles.map((role, index) => {
                                        const available = rolesByDb[role.db];
                                        const known = available || [];
                                        const hasCurrent = !role.role || known.some((r) => r.role === role.role);
                                        return (
                                            <div className="role-editor-row" key={index}>
                                                <select value={role.role}
                                                        onChange={(e) => updateRole(index, {role: e.target.value})}>
                                                    <option value="">Select a role...</option>
                                                    {!hasCurrent && <option value={role.role}>{role.role}</option>}
                                                    <optgroup label="Built-in">
                                                        {known.filter((r) => r.isBuiltin).map((r) => (
                                                            <option key={r.role} value={r.role}>{r.role}</option>
                                                        ))}
                                                    </optgroup>
                                                    <optgroup label="Custom">
                                                        {known.filter((r) => !r.isBuiltin).map((r) => (
                                                            <option key={r.role} value={r.role}>{r.role}</option>
                                                        ))}
                                                    </optgroup>
                                                </select>
                                                <span className="role-editor-on">on</span>
                                                <select value={role.db}
                                                        onChange={(e) => updateRole(index, {db: e.target.value})}>
                                                    {!dbOptions.includes(role.db) &&
                                                        <option value={role.db}>{role.db}</option>}
                                                    {dbOptions.map((db) => <option key={db} value={db}>{db}</option>)}
                                                </select>
                                                <button type="button"
                                                        className="delete-icon-btn icon-btn"
                                                        title="Remove role"
                                                        onClick={() => removeRole(index)}>
                                                    <TrashIcon/>
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {!isCreate && (
                            <div className="user-editor-section">
                                <div className="user-editor-section-head">
                                    <h4>Effective permissions</h4>
                                </div>
                                <p className="hint-text">
                                    Resolved by the server from the assigned roles, including inherited ones. Updates
                                    after saving.
                                </p>
                                {groupedPrivileges.length === 0 ? (
                                    <div className="tree-empty">No permissions.</div>
                                ) : (
                                    <div className="privilege-list">
                                        {groupedPrivileges.map((entry) => (
                                            <div className="privilege-row" key={entry.label}>
                                                <div
                                                    className={`privilege-resource ${entry.wildcard ? 'is-wildcard' : ''}`}>
                                                    {entry.label}
                                                </div>
                                                <div className="privilege-actions">
                                                    {entry.actions.map((action) => (
                                                        <span className="action-chip" key={action}>{action}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}

                <div className="modal-actions">
                    <div className="spacer"/>
                    <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
                    <button type="button" className="primary" onClick={handleSave} disabled={saving || loading}>
                        {saving ? 'Saving...' : isCreate ? 'Create user' : 'Save changes'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function TrashIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path
                d="M2 4h12M6.5 4V2.5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1V4M12.5 4l-.6 9.4a1 1 0 0 1-1 .9H5.1a1 1 0 0 1-1-.9L3.5 4"
                stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M6.5 7v4M9.5 7v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
    );
}
