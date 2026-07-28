import React, {useEffect, useMemo, useState} from 'react';
import {useTranslation, Trans} from 'react-i18next';
import {groupPrivilegesByResource, sameRole} from '../lib/mongoPrivileges.js';

export default function UserEditorDialog({connId, authDb, username, onClose, onSaved}) {
    const {t} = useTranslation();
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
            setError(t('dialogs.userEditor.errorRoleIncomplete'));
            return;
        }
        if (roles.some((r, i) => roles.findIndex((other) => sameRole(other, r)) !== i)) {
            setError(t('dialogs.userEditor.errorDuplicateRole'));
            return;
        }
        if ((password || passwordConfirm) && password !== passwordConfirm) {
            setError(t('dialogs.userEditor.errorPasswordMismatch'));
            return;
        }
        if (isCreate && !newUsername.trim()) {
            setError(t('dialogs.userEditor.errorUsernameRequired'));
            return;
        }
        if (isCreate && !password) {
            setError(t('dialogs.userEditor.errorPasswordRequired'));
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
                <h3>{isCreate ? t('dialogs.userEditor.createTitle') : t('dialogs.userEditor.editTitle', {username})}</h3>
                <p className="hint-text">
                    {t('dialogs.userEditor.authDb')} <strong>{authDb}</strong>
                    {mechanisms.length > 0 && <> &middot; {t('dialogs.userEditor.mechanisms', {list: mechanisms.join(', ')})}</>}
                </p>

                {error && <div className="error-banner">{error}</div>}

                {loading ? (
                    <div className="tree-loading">{t('dialogs.userEditor.loading')}</div>
                ) : (
                    <>
                        {isCreate && (
                            <div className="user-editor-field">
                                <label>{t('dialogs.userEditor.username')}</label>
                                <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} autoFocus/>
                            </div>
                        )}

                        <div className="user-editor-section">
                            <div className="user-editor-section-head">
                                <h4>{t('dialogs.userEditor.passwordHeading')}</h4>
                            </div>
                            <p className="hint-text">
                                {isCreate ? t('dialogs.userEditor.passwordRequired') : t('dialogs.userEditor.passwordKeepHint')}
                            </p>
                            <div className="row">
                                <div>
                                    <label>{isCreate ? t('dialogs.userEditor.password') : t('dialogs.userEditor.newPassword')}</label>
                                    <input type="password"
                                           value={password}
                                           autoComplete="new-password"
                                           onChange={(e) => setPassword(e.target.value)}/>
                                </div>
                                <div>
                                    <label>{t('dialogs.userEditor.confirmPassword')}</label>
                                    <input type="password"
                                           value={passwordConfirm}
                                           autoComplete="new-password"
                                           onChange={(e) => setPasswordConfirm(e.target.value)}/>
                                </div>
                            </div>
                        </div>

                        <div className="user-editor-section">
                            <div className="user-editor-section-head">
                                <h4>{t('dialogs.userEditor.rolesHeading')}</h4>
                                <button type="button" onClick={addRole}>{t('dialogs.userEditor.addRole')}</button>
                            </div>
                            <p className="hint-text">
                                <Trans i18nKey="dialogs.userEditor.rolesHint" values={{admin: 'admin'}} components={{code: <code/>}}/>
                            </p>
                            {roles.length === 0 ? (
                                <div className="tree-empty">{t('dialogs.userEditor.noRoles')}</div>
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
                                                    <option value="">{t('dialogs.userEditor.selectRole')}</option>
                                                    {!hasCurrent && <option value={role.role}>{role.role}</option>}
                                                    <optgroup label={t('dialogs.userEditor.builtin')}>
                                                        {known.filter((r) => r.isBuiltin).map((r) => (
                                                            <option key={r.role} value={r.role}>{r.role}</option>
                                                        ))}
                                                    </optgroup>
                                                    <optgroup label={t('dialogs.userEditor.custom')}>
                                                        {known.filter((r) => !r.isBuiltin).map((r) => (
                                                            <option key={r.role} value={r.role}>{r.role}</option>
                                                        ))}
                                                    </optgroup>
                                                </select>
                                                <span className="role-editor-on">{t('dialogs.userEditor.on')}</span>
                                                <select value={role.db}
                                                        onChange={(e) => updateRole(index, {db: e.target.value})}>
                                                    {!dbOptions.includes(role.db) &&
                                                        <option value={role.db}>{role.db}</option>}
                                                    {dbOptions.map((db) => <option key={db} value={db}>{db}</option>)}
                                                </select>
                                                <button type="button"
                                                        className="delete-icon-btn icon-btn"
                                                        title={t('dialogs.userEditor.removeRole')}
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
                                    <h4>{t('dialogs.userEditor.permissionsHeading')}</h4>
                                </div>
                                <p className="hint-text">
                                    {t('dialogs.userEditor.permissionsHint')}
                                </p>
                                {groupedPrivileges.length === 0 ? (
                                    <div className="tree-empty">{t('dialogs.userEditor.noPermissions')}</div>
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
                    <button type="button" onClick={onClose} disabled={saving}>{t('dialogs.common.cancel')}</button>
                    <button type="button" className="primary" onClick={handleSave} disabled={saving || loading}>
                        {saving ? t('dialogs.userEditor.saving') : isCreate ? t('dialogs.userEditor.createUser') : t('dialogs.userEditor.saveChanges')}
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