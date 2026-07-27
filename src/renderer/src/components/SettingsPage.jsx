import React, {useState, useEffect} from 'react';
import UpdaterSection from './UpdaterSection.jsx';

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
        window.api.settings.get().then(setSettings);
        window.api.vault.status().then(setVaultStatus);
        window.api.app.getInfo().then(setAppInfo);
    }, []);

    async function updateLanguage(lang) {
        const next = await window.api.settings.set('language', lang);
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

    if (!settings || !vaultStatus) return null;

    return (
        <div className="settings-overlay">
            <div className="settings-page">
                <h1>Settings</h1>

                {info && <div className="info-banner">{info}</div>}
                {error && <div className="error-banner">{error}</div>}

                <div className="settings-section">
                    <h3>Language</h3>
                    <p className="settings-section-desc">Choose the interface language.</p>
                    <div className="settings-row">
                        <span className="settings-row-label">Interface language</span>
                        <select value={settings.language || 'en'} onChange={(e) => updateLanguage(e.target.value)}>
                            <option value="en">English</option>
                        </select>
                    </div>
                </div>

                <div className="settings-section">
                    <h3>Editor</h3>
                    <p className="settings-section-desc">Choose which view the document editor opens in.</p>
                    <div className="settings-row">
                        <span className="settings-row-label">Default tab editor</span>
                        <select
                            value={settings.defaultEditorTab || 'tree'}
                            onChange={(e) => updateDefaultEditorTab(e.target.value)}
                        >
                            <option value="tree">Tree</option>
                            <option value="raw">Raw</option>
                        </select>
                    </div>
                </div>

                <div className="settings-section">
                    <h3>Master Password</h3>
                    <p className="settings-section-desc">
                        Encrypts all saved connections (including passwords and SSH keys) on disk with AES-256.
                        You'll be asked for it every time you start the app.
                    </p>

                    {!vaultStatus.encryptionEnabled && mode !== 'setup' && (
                        <button className="primary" onClick={() => {
                            resetForm();
                            setMode('setup');
                        }}>Set up master password</button>
                    )}

                    {vaultStatus.encryptionEnabled && !mode && (
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
                    )}

                    {mode === 'setup' && (
                        <form onSubmit={handleSetup}>
                            <input type="password" placeholder="New master password" value={newPw}
                                   onChange={(e) => setNewPw(e.target.value)} autoFocus/>
                            <input type="password" placeholder="Confirm password" value={confirmPw}
                                   onChange={(e) => setConfirmPw(e.target.value)}/>
                            <div className="modal-actions">
                                <div className="spacer"/>
                                <button type="button" onClick={resetForm}>Cancel</button>
                                <button type="submit" className="primary"
                                        disabled={busy}>{busy ? 'Setting up...' : 'Enable'}</button>
                            </div>
                        </form>
                    )}

                    {mode === 'change' && (
                        <form onSubmit={handleChange}>
                            <input type="password" placeholder="Current master password" value={currentPw}
                                   onChange={(e) => setCurrentPw(e.target.value)} autoFocus/>
                            <input type="password" placeholder="New master password" value={newPw}
                                   onChange={(e) => setNewPw(e.target.value)}/>
                            <input type="password" placeholder="Confirm new password" value={confirmPw}
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
                        <form onSubmit={handleDisable}>
                            <input type="password" placeholder="Current master password" value={currentPw}
                                   onChange={(e) => setCurrentPw(e.target.value)} autoFocus/>
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
                    <h3>Backup</h3>
                    <p className="settings-section-desc">Export or import all settings and saved connections as a single
                        JSON file.</p>
                    <div className="toolbar">
                        <button onClick={handleExport}>Export settings & connections</button>
                        <button onClick={handleImport}>Import settings & connections</button>
                    </div>
                </div>

                <UpdaterSection/>

                <div className="settings-section">
                    <h3>About</h3>
                    {appInfo && appInfo.isDev && (
                        <div className="info-banner dev-mode-banner">Development environment detected</div>
                    )}
                    {appInfo ? (
                        <>
                            <div className="settings-row">
                                <span className="settings-row-label">Version</span>
                                <span className="settings-row-value">{appInfo.version}</span>
                            </div>
                            <div className="settings-row">
                                <span className="settings-row-label">Branch</span>
                                <span className="settings-row-value">{appInfo.branch || 'unknown'}</span>
                            </div>
                            <div className="settings-row">
                                <span className="settings-row-label">Commit</span>
                                <span className="settings-row-value">
                                    {appInfo.commit ? appInfo.commit : 'unknown'}
                                    {appInfo.commit && appInfo.dirty ? ' (modified)' : ''}
                                </span>
                            </div>
                        </>
                    ) : (
                        <p className="settings-section-desc">Loading...</p>
                    )}
                </div>
            </div>
        </div>
    );
}