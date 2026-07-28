import React, {useState, useEffect} from 'react';
import UpdaterSection from './UpdaterSection.jsx';

function SettingsSkeleton() {
    return (
        <div className="settings-overlay">
            <div className="settings-page">
                <h1>Settings</h1>
                {[0, 1, 2].map((i) => (
                    <div className="settings-section skeleton-section" key={i}>
                        <div className="skeleton-line skeleton-line-title"/>
                        <div className="skeleton-line skeleton-line-desc"/>
                        <div className="skeleton-row"/>
                        <div className="skeleton-row"/>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function SettingsPage({connections, onImported}) {
    const [settings, setSettings] = useState(null);
    const [vaultStatus, setVaultStatus] = useState(null);
    const [appInfo, setAppInfo] = useState(null);
    const [mode, setMode] = useState(null); // null | 'setup' | 'change' | 'disable'
    const [currentPw, setCurrentPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        Promise.all([
            window.api.settings.get(),
            window.api.vault.status(),
            window.api.app.getInfo(),
        ]).then(([s, v, a]) => {
            setSettings(s);
            setVaultStatus(v);
            setAppInfo(a);
        });
    }, []);

    async function updateLanguage(lang) {
        const next = await window.api.settings.set('language', lang);
        setSettings(next);
    }

    async function updateUpdateChannel(value) {
        const next = await window.api.settings.set('updateChannel', value);
        setSettings(next);
    }

    async function updateDefaultEditorTab(value) {
        const next = await window.api.settings.set('defaultEditorTab', value);
        setSettings(next);
    }

    function resetForm() {
        setMode(null);
        setCurrentPw('');
        setNewPw('');
        setConfirmPw('');
        setError('');
    }

    async function handleSetup(e) {
        e.preventDefault();
        if (newPw !== confirmPw) {
            setError('Passwords do not match.');
            return;
        }
        if (newPw.length < 6) {
            setError('Use at least 6 characters.');
            return;
        }
        setBusy(true);
        await window.api.vault.setup(newPw);
        setBusy(false);
        setInfo('Master password enabled. Your connections are now encrypted on disk.');
        setVaultStatus(await window.api.vault.status());
        resetForm();
    }

    async function handleChange(e) {
        e.preventDefault();
        if (newPw !== confirmPw) {
            setError('Passwords do not match.');
            return;
        }
        if (newPw.length < 6) {
            setError('Use at least 6 characters.');
            return;
        }
        setBusy(true);
        const ok = await window.api.vault.changePassphrase(currentPw, newPw);
        setBusy(false);
        if (ok) {
            setInfo('Master password changed.');
            resetForm();
        } else {
            setError('Current password is incorrect.');
        }
    }

    async function handleDisable(e) {
        e.preventDefault();
        setBusy(true);
        const ok = await window.api.vault.disable(currentPw);
        setBusy(false);
        if (ok) {
            setInfo('Master password removed. Connections are now stored unencrypted.');
            setVaultStatus(await window.api.vault.status());
            resetForm();
        } else {
            setError('Current password is incorrect.');
        }
    }

    async function handleExport() {
        const result = await window.api.settings.export(connections);
        if (result.ok) setInfo(`Exported to ${result.filePath}`);
    }

    async function handleImport() {
        setError('');
        const result = await window.api.settings.import();
        if (!result) return;
        if (result.ok === false) {
            if (result.error) setError(result.error);
            return; // cancelled or failed silently (no file picked)
        }
        setSettings(result.settings);
        setInfo(`Imported ${result.importedConnectionCount} connection(s) and settings.`);
        if (onImported) onImported();
    }

    if (!settings || !vaultStatus) return <SettingsSkeleton/>;

    return (
        <div className="settings-overlay">
            <div className="settings-page">
                <h1>Settings</h1>

                {info && <div className="info-banner"><i className="fa-solid fa-circle-check"/> {info}</div>}
                {error && <div className="error-banner"><i className="fa-solid fa-triangle-exclamation"/> {error}</div>}

                <div className="settings-section">
                    <h3><i className="fa-solid fa-sliders"/> General</h3>
                    <p className="settings-section-desc">Here you can configure various general settings</p>
                    <div className="settings-row">
                        <span className="settings-row-label">Interface language</span>
                        <select value={settings.language || 'en'} onChange={(e) => updateLanguage(e.target.value)} disabled="true">
                            <option value="en">English</option>
                        </select>
                    </div>
                    <div className="settings-row">
                        <span className="settings-row-label">Update Channel</span>
                        <select value={settings.updateChannel || 'stable'} onChange={(e) => updateUpdateChannel(e.target.value)}>
                            <option value="stable">Stable</option>
                            <option value="canary">Canary</option>
                        </select>
                    </div>
                </div>

                <div className="settings-section">
                    <h3><i className="fa-solid fa-file-code"/> Document Editor</h3>
                    <p className="settings-section-desc">Here you can adjust various settings for the document editor</p>
                    <div className="settings-row">
                        <span className="settings-row-label">Default tab editor</span>
                        <select value={settings.defaultEditorTab || 'tree'}
                                onChange={(e) => updateDefaultEditorTab(e.target.value)}>
                            <option value="tree">Tree</option>
                            <option value="raw">Raw</option>
                        </select>
                    </div>
                </div>

                <div className="settings-section">
                    <h3><i className="fa-solid fa-shield-halved"/> Security</h3>
                    <p className="settings-section-desc">Here you can adjust your security settings</p>

                    {!vaultStatus.encryptionEnabled && mode !== 'setup' && (
                        <div className="settings-row">
                            <span className="settings-row-label">Master password is not set. Connections are stored unencrypted.</span>
                            <button className="primary" onClick={() => {
                                resetForm();
                                setMode('setup');
                            }}><i className="fa-solid fa-lock"/> Set up master password</button>
                        </div>
                    )}

                    {vaultStatus.encryptionEnabled && !mode && (
                        <div className="settings-row">
                            <span className="settings-row-label"><i className="fa-solid fa-lock" style={{color: 'var(--accent)'}}/> Master password is enabled.</span>
                            <div className="toolbar">
                                <button onClick={() => {
                                    resetForm();
                                    setMode('change');
                                }}>Change password
                                </button>
                                <button onClick={() => {
                                    resetForm();
                                    setMode('disable');
                                }}>Remove master password
                                </button>
                            </div>
                        </div>
                    )}

                    {mode === 'setup' && (
                        <form onSubmit={handleSetup} className="settings-form">
                            <label className="settings-form-label">New master password</label>
                            <input type="password" placeholder="At least 6 characters" value={newPw}
                                   onChange={(e) => setNewPw(e.target.value)} autoFocus/>
                            <label className="settings-form-label">Confirm password</label>
                            <input type="password" placeholder="Repeat password" value={confirmPw}
                                   onChange={(e) => setConfirmPw(e.target.value)}/>
                            <p className="hint-text">This password encrypts your saved connections on disk. It cannot be recovered if lost.</p>
                            <div className="modal-actions">
                                <div className="spacer"/>
                                <button type="button" onClick={resetForm}>Cancel</button>
                                <button type="submit" className="primary"
                                        disabled={busy}>{busy ? 'Setting up...' : 'Enable'}</button>
                            </div>
                        </form>
                    )}

                    {mode === 'change' && (
                        <form onSubmit={handleChange} className="settings-form">
                            <label className="settings-form-label">Current master password</label>
                            <input type="password" placeholder="Current password" value={currentPw}
                                   onChange={(e) => setCurrentPw(e.target.value)} autoFocus/>
                            <label className="settings-form-label">New master password</label>
                            <input type="password" placeholder="At least 6 characters" value={newPw}
                                   onChange={(e) => setNewPw(e.target.value)}/>
                            <label className="settings-form-label">Confirm new password</label>
                            <input type="password" placeholder="Repeat password" value={confirmPw}
                                   onChange={(e) => setConfirmPw(e.target.value)}/>
                            <div className="modal-actions">
                                <div className="spacer"/>
                                <button type="button" onClick={resetForm}>Cancel</button>
                                <button type="submit" className="primary"
                                        disabled={busy}>{busy ? 'Changing...' : 'Change'}</button>
                            </div>
                        </form>
                    )}

                    {mode === 'disable' && (
                        <form onSubmit={handleDisable} className="settings-form">
                            <label className="settings-form-label">Current master password</label>
                            <input type="password" placeholder="Current password" value={currentPw}
                                   onChange={(e) => setCurrentPw(e.target.value)} autoFocus/>
                            <p className="hint-text">Connections will be stored unencrypted on disk after this.</p>
                            <div className="modal-actions">
                                <div className="spacer"/>
                                <button type="button" onClick={resetForm}>Cancel</button>
                                <button type="submit" className="danger"
                                        disabled={busy}>{busy ? 'Removing...' : 'Remove'}</button>
                            </div>
                        </form>
                    )}
                </div>

                <div className="settings-section">
                    <h3><i className="fa-solid fa-box-archive"/> Backup</h3>
                    <p className="settings-section-desc">Export or import all settings and saved connections as a single
                        JSON file.</p>
                    <div className="toolbar">
                        <button onClick={handleExport}><i className="fa-solid fa-file-export"/> Export settings & connections</button>
                        <button onClick={handleImport}><i className="fa-solid fa-file-import"/> Import settings & connections</button>
                    </div>
                </div>

                <UpdaterSection/>

                <div className="settings-section">
                    <h3><i className="fa-solid fa-circle-info"/> About</h3>
                    <div className="settings-row">
                        <span className="settings-row-label">Version</span>
                        <span className="settings-row-value">{appInfo.version}</span>
                    </div>
                    <div className="settings-row">
                        <span className="settings-row-label">Git</span>
                        <span className="settings-row-value">
                            {appInfo.commit ? appInfo.commit : 'unknown'}
                            <span className="settings-row-value-child">    @ {appInfo.branch || 'unknown'}</span>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}