import React, {useState, useEffect} from 'react';
import {useTranslation} from 'react-i18next';
import UpdaterSection from './UpdaterSection.jsx';
import Select from './Select.jsx';

const CATEGORIES = [
    {id: 'general', icon: 'fa-sliders'},
    {id: 'editor', icon: 'fa-file-code'},
    {id: 'security', icon: 'fa-shield-halved'},
    {id: 'backup', icon: 'fa-box-archive'},
    {id: 'updates', icon: 'fa-arrows-rotate'},
    {id: 'about', icon: 'fa-circle-info'},
];

function Toggle({checked, onChange}) {
    return (
        <label className="settings-toggle">
            <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)}/>
            <span className="settings-toggle-track"><span className="settings-toggle-thumb"/></span>
        </label>
    );
}

function SettingsSkeleton() {
    const {t} = useTranslation();
    return (
        <div className="settings-overlay">
            <div className="settings-page settings-page-shell">
                <h1>{t('settings.title')}</h1>
                <div className="settings-layout">
                    <div className="settings-nav">
                        {CATEGORIES.map((c) => (
                            <div className="settings-nav-item skeleton-line" key={c.id} style={{height: 34}}/>
                        ))}
                    </div>
                    <div className="settings-content">
                        {[0, 1].map((i) => (
                            <div className="settings-section skeleton-section" key={i}>
                                <div className="skeleton-line skeleton-line-title"/>
                                <div className="skeleton-line skeleton-line-desc"/>
                                <div className="skeleton-row"/>
                                <div className="skeleton-row"/>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function SettingsPage({connections, onImported, settingsSignal}) {
    const {t, i18n} = useTranslation();
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
    const [activeCategory, setActiveCategory] = useState(
        CATEGORIES.some((c) => c.id === settingsSignal?.category) ? settingsSignal.category : 'general'
    );

    useEffect(() => {
        if (settingsSignal?.category && CATEGORIES.some((c) => c.id === settingsSignal.category)) {
            setActiveCategory(settingsSignal.category);
        }
    }, [settingsSignal?.ts]);

    useEffect(() => {
        Promise.all([
            window.api.settings.get(),
            window.api.vault.status(),
            window.api.app.getInfo(),
        ]).then(([s, v, a]) => {
            setSettings(s);
            setVaultStatus(v);
            setAppInfo(a);
            if (s?.glassIntensity != null) {
                document.documentElement.style.setProperty('--glass-intensity', s.glassIntensity);
            }
        });
    }, []);

    async function updateLanguage(lang) {
        const next = await window.api.settings.set('language', lang);
        setSettings(next);
        i18n.changeLanguage(lang);
    }

    async function updateTheme(value) {
        const next = await window.api.settings.set('theme', value);
        setSettings(next);
        document.body.classList.toggle('dark', value === 'dark');
    }

    async function updateGlassIntensity(value) {
        document.documentElement.style.setProperty('--glass-intensity', value);
        setSettings((prev) => ({...prev, glassIntensity: value}));
    }

    async function commitGlassIntensity(value) {
        const next = await window.api.settings.set('glassIntensity', value);
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

    async function updateMultiColumnSort(value) {
        const next = await window.api.settings.set('multiColumnSort', value);
        setSettings(next);
    }

    async function updateShowHistoryChangesOnly(value) {
        const next = await window.api.settings.set('showHistoryChangesOnly', value);
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
            setError(t('settings.security.errorMismatch'));
            return;
        }
        if (newPw.length < 6) {
            setError(t('settings.security.errorTooShort'));
            return;
        }
        setBusy(true);
        await window.api.vault.setup(newPw);
        setBusy(false);
        setInfo(t('settings.security.successSetup'));
        setVaultStatus(await window.api.vault.status());
        resetForm();
    }

    async function handleChange(e) {
        e.preventDefault();
        if (newPw !== confirmPw) {
            setError(t('settings.security.errorMismatch'));
            return;
        }
        if (newPw.length < 6) {
            setError(t('settings.security.errorTooShort'));
            return;
        }
        setBusy(true);
        const ok = await window.api.vault.changePassphrase(currentPw, newPw);
        setBusy(false);
        if (ok) {
            setInfo(t('settings.security.successChange'));
            resetForm();
        } else {
            setError(t('settings.security.errorWrongCurrent'));
        }
    }

    async function handleDisable(e) {
        e.preventDefault();
        setBusy(true);
        const ok = await window.api.vault.disable(currentPw);
        setBusy(false);
        if (ok) {
            setInfo(t('settings.security.successDisable'));
            setVaultStatus(await window.api.vault.status());
            resetForm();
        } else {
            setError(t('settings.security.errorWrongCurrent'));
        }
    }

    async function handleExport() {
        const result = await window.api.settings.export(connections);
        if (result.ok) setInfo(t('settings.backup.exportedTo', {path: result.filePath}));
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
        setInfo(t('settings.backup.importedCount', {count: result.importedConnectionCount}));
        if (onImported) onImported();
    }

    if (!settings || !vaultStatus) return <SettingsSkeleton/>;

    return (
        <div className="settings-overlay">
            <div className="settings-page settings-page-shell">
                <h1>{t('settings.title')}</h1>

                {info && <div className="info-banner"><i className="fa-solid fa-circle-check"/> {info}</div>}
                {error && <div className="error-banner"><i className="fa-solid fa-triangle-exclamation"/> {error}</div>}

                <div className="settings-layout">
                    <nav className="settings-nav">
                        {CATEGORIES.map((c) => (
                            <button
                                key={c.id}
                                className={`settings-nav-item ${activeCategory === c.id ? 'active' : ''}`}
                                onClick={() => setActiveCategory(c.id)}
                            >
                                <i className={`fa-solid ${c.icon}`}/>
                                <span>{c.id === 'updates' ? t('updaterSection.heading') : t(`settings.${c.id}.heading`)}</span>
                            </button>
                        ))}
                    </nav>

                    <div className="settings-content" key={activeCategory}>
                        {activeCategory === 'general' && (
                            <div className="settings-section">
                                <div className="settings-section-head">
                                    <span className="settings-icon-badge"><i className="fa-solid fa-sliders"/></span>
                                    <h3>{t('settings.general.heading')}</h3>
                                </div>
                                <p className="settings-section-desc">{t('settings.general.desc')}</p>
                                <div className="settings-row">
                                    <span className="settings-row-label">{t('settings.general.language')}</span>
                                    <Select value={settings.language || 'en'}
                                            onChange={updateLanguage}
                                            options={[
                                                {value: 'en', label: 'English'},
                                                {value: 'de', label: 'Deutsch'},
                                            ]}/>
                                </div>
                                <div className="settings-row">
                                    <span className="settings-row-label">{t('settings.general.theme.heading')}</span>
                                    <Select value={settings.theme || 'light'}
                                            onChange={updateTheme}
                                            options={[
                                                {value: 'light', label: t('settings.general.theme.light')},
                                                {value: 'dark', label: t('settings.general.theme.dark')},
                                            ]}/>
                                </div>
                                <div className="settings-row">
                                    <span className="settings-row-label">{t('settings.general.update-channel.heading')}</span>
                                    <Select value={settings.updateChannel || 'stable'}
                                            onChange={updateUpdateChannel}
                                            options={[
                                                {value: 'stable', label: t('settings.general.update-channel.stable')},
                                                {value: 'canary', label: t('settings.general.update-channel.canary')},
                                            ]}/>
                                </div>
                                <div className="settings-row settings-row-slider">
                                    <span className="settings-row-label">{t('settings.general.glass-intensity')}</span>
                                    <div className="settings-slider-wrap">
                                        <input type="range"
                                               min="0"
                                               max="1"
                                               step="0.05"
                                               value={settings.glassIntensity ?? 1}
                                               onChange={(e) => updateGlassIntensity(Number(e.target.value))}
                                               onMouseUp={(e) => commitGlassIntensity(Number(e.target.value))}
                                               onKeyUp={(e) => commitGlassIntensity(Number(e.target.value))}/>
                                        <span className="settings-slider-value">{Math.round((settings.glassIntensity ?? 1) * 100)}%</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeCategory === 'editor' && (
                            <div className="settings-section">
                                <div className="settings-section-head">
                                    <span className="settings-icon-badge"><i className="fa-solid fa-file-code"/></span>
                                    <h3>{t('settings.editor.heading')}</h3>
                                </div>
                                <p className="settings-section-desc">{t('settings.editor.desc')}</p>

                                <div className="settings-subsection">
                                    <span className="settings-subsection-label">{t('settings.editor.defaultTab')}</span>
                                    <Select value={settings.defaultEditorTab || 'tree'}
                                            onChange={updateDefaultEditorTab}
                                            options={[
                                                {value: 'tree', label: t('settings.editor.tab.tree')},
                                                {value: 'raw', label: t('settings.editor.tab.raw')},
                                            ]}/>
                                </div>

                                <div className="settings-subsection">
                                    <span className="settings-subsection-label">{t('settings.documentsTable.multiColumnSort')}</span>
                                    <Toggle checked={settings.multiColumnSort} onChange={updateMultiColumnSort}/>
                                </div>

                                <div className="settings-subsection">
                                    <span className="settings-subsection-label">{t('settings.history.showOnlyChanges')}</span>
                                    <Toggle checked={settings.showHistoryChangesOnly} onChange={updateShowHistoryChangesOnly}/>
                                </div>
                            </div>
                        )}

                        {activeCategory === 'security' && (
                            <div className="settings-section">
                                <div className="settings-section-head">
                                    <span className="settings-icon-badge"><i className="fa-solid fa-shield-halved"/></span>
                                    <h3>{t('settings.security.heading')}</h3>
                                </div>
                                <p className="settings-section-desc">{t('settings.security.desc')}</p>

                                {!vaultStatus.encryptionEnabled && mode !== 'setup' && (
                                    <div className="settings-row">
                                        <span className="settings-row-label">{t('settings.security.notSet')}</span>
                                        <button className="primary" onClick={() => {
                                            resetForm();
                                            setMode('setup');
                                        }}><i className="fa-solid fa-lock"/> {t('settings.security.setup')}</button>
                                    </div>
                                )}

                                {vaultStatus.encryptionEnabled && !mode && (
                                    <div className="settings-row">
                                        <span className="settings-row-label"><i className="fa-solid fa-lock" style={{color: 'var(--accent)'}}/> {t('settings.security.enabled')}</span>
                                        <div className="toolbar">
                                            <button onClick={() => {
                                                resetForm();
                                                setMode('change');
                                            }}>{t('settings.security.change')}
                                            </button>
                                            <button onClick={() => {
                                                resetForm();
                                                setMode('disable');
                                            }}>{t('settings.security.remove')}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {mode === 'setup' && (
                                    <form onSubmit={handleSetup} className="settings-form">
                                        <label className="settings-form-label">{t('settings.security.newPassword')}</label>
                                        <input type="password" placeholder={t('settings.security.placeholderMinChars')} value={newPw}
                                               onChange={(e) => setNewPw(e.target.value)} autoFocus/>
                                        <label className="settings-form-label">{t('settings.security.confirmPassword')}</label>
                                        <input type="password" placeholder={t('settings.security.placeholderRepeat')} value={confirmPw}
                                               onChange={(e) => setConfirmPw(e.target.value)}/>
                                        <p className="hint-text">{t('settings.security.hintSetup')}</p>
                                        <div className="modal-actions">
                                            <div className="spacer"/>
                                            <button type="button" onClick={resetForm}>{t('settings.security.cancel')}</button>
                                            <button type="submit" className="primary"
                                                    disabled={busy}>{busy ? t('settings.security.settingUp') : t('settings.security.enable')}</button>
                                        </div>
                                    </form>
                                )}

                                {mode === 'change' && (
                                    <form onSubmit={handleChange} className="settings-form">
                                        <label className="settings-form-label">{t('settings.security.currentPassword')}</label>
                                        <input type="password" placeholder={t('settings.security.placeholderCurrent')} value={currentPw}
                                               onChange={(e) => setCurrentPw(e.target.value)} autoFocus/>
                                        <label className="settings-form-label">{t('settings.security.newPassword')}</label>
                                        <input type="password" placeholder={t('settings.security.placeholderMinChars')} value={newPw}
                                               onChange={(e) => setNewPw(e.target.value)}/>
                                        <label className="settings-form-label">{t('settings.security.confirmNewPassword')}</label>
                                        <input type="password" placeholder={t('settings.security.placeholderRepeat')} value={confirmPw}
                                               onChange={(e) => setConfirmPw(e.target.value)}/>
                                        <div className="modal-actions">
                                            <div className="spacer"/>
                                            <button type="button" onClick={resetForm}>{t('settings.security.cancel')}</button>
                                            <button type="submit" className="primary"
                                                    disabled={busy}>{busy ? t('settings.security.changing') : t('settings.security.changeSubmit')}</button>
                                        </div>
                                    </form>
                                )}

                                {mode === 'disable' && (
                                    <form onSubmit={handleDisable} className="settings-form">
                                        <label className="settings-form-label">{t('settings.security.currentPassword')}</label>
                                        <input type="password" placeholder={t('settings.security.placeholderCurrent')} value={currentPw}
                                               onChange={(e) => setCurrentPw(e.target.value)} autoFocus/>
                                        <p className="hint-text">{t('settings.security.hintDisable')}</p>
                                        <div className="modal-actions">
                                            <div className="spacer"/>
                                            <button type="button" onClick={resetForm}>{t('settings.security.cancel')}</button>
                                            <button type="submit" className="danger"
                                                    disabled={busy}>{busy ? t('settings.security.removing') : t('settings.security.removeSubmit')}</button>
                                        </div>
                                    </form>
                                )}
                            </div>
                        )}

                        {activeCategory === 'backup' && (
                            <div className="settings-section">
                                <div className="settings-section-head">
                                    <span className="settings-icon-badge"><i className="fa-solid fa-box-archive"/></span>
                                    <h3>{t('settings.backup.heading')}</h3>
                                </div>
                                <p className="settings-section-desc">{t('settings.backup.desc')}</p>
                                <div className="update-toolbar">
                                    <button onClick={handleExport}><i className="fa-solid fa-file-export"/> {t('settings.backup.export')}</button>
                                    <button onClick={handleImport}><i className="fa-solid fa-file-import"/> {t('settings.backup.import')}</button>
                                </div>
                            </div>
                        )}

                        {activeCategory === 'updates' && <UpdaterSection/>}

                        {activeCategory === 'about' && (
                            <div className="settings-section">
                                <div className="settings-section-head">
                                    <span className="settings-icon-badge"><i className="fa-solid fa-circle-info"/></span>
                                    <h3>{t('settings.about.heading')}</h3>
                                </div>
                                <div className="settings-row">
                                    <span className="settings-row-label">{t('settings.about.version')}</span>
                                    <span className="settings-row-value">{appInfo.version}</span>
                                </div>
                                <div className="settings-row">
                                    <span className="settings-row-label">{t('settings.about.git')}</span>
                                    <span className="settings-row-value">
                                        {appInfo.commit ? appInfo.commit : t('settings.about.unknown')}
                                        <span className="settings-row-value-child">    @ {appInfo.branch || t('settings.about.unknown')}</span>
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}