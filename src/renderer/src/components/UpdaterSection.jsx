import React, {useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import Markdown from './Markdown.jsx';

function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex++;
    }
    return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function formatEta(seconds, t) {
    if (seconds === null || seconds === undefined) return t('updaterSection.calculating');
    if (seconds < 1) return t('updaterSection.almostDone');
    if (seconds < 60) return t('updaterSection.secondsRemaining', {count: Math.ceil(seconds)});
    const minutes = Math.floor(seconds / 60);
    const secs = Math.ceil(seconds % 60);
    return t('updaterSection.minutesSecondsRemaining', {minutes, seconds: secs});
}

const DEV_SAMPLE_RELEASE_NOTES = `# Release Notes - Version 2.4.0

---

## 🚀 Overview

Welcome to **Version 2.4.0**! This update brings *many improvements*, ~legacy features~ have been removed, and **_core components_** have been optimized.

> **Important Note:** Node.js 18+ is now required to run the application.

---

## 🛠️ Features & Changes

### 1. Dashboard Redesign
* New data overview panels
* Optimized load times
  * Sub-item: Caching enabled
  * Sub-item: Database queries reduced

### 2. API Endpoints
1. \`/api/v1/users\`
2. \`/api/v1/auth\`
3. \`/api/v1/settings\`

### 3. Task List
- [x] UI Refactoring
- [x] Dependency updates
- [ ] Complete documentation

---

## 📊 System Comparison

| Feature | Old (v2.3) | New (v2.4) | Status |
| :--- | :---: | :---: | ---: |
| Performance | Standard | 2x Faster | ✅ |
| Dark Mode | Experimental | Fully Supported | ✅ |
| Legacy API | Supported | Deprecated | ⚠️ |

---

## 💻 Code Example

Application configuration:

\`\`\`json
{
  "server": {
    "host": "0.0.0.0",
    "port": 8080,
    "ssl": true
  },
  "features": ["auth", "dashboard", "metrics"]
}

\`\`\`

Run \`npm run build\` to start the build process.

---

## 🔗 Links & Media

Check out the [documentation](https://www.google.com/search?q=https://example.com/docs) for more details.`;

const DEV_PREVIEW_PHASES = [
    {key: 'idle', label: 'Idle'},
    {key: 'checking', label: 'Checking'},
    {key: 'not-available', label: 'Up to date'},
    {key: 'available', label: 'Available'},
    {key: 'downloading', label: 'Downloading'},
    {key: 'downloaded', label: 'Downloaded'},
    {key: 'error', label: 'Error'}
];

export default function UpdaterSection() {
    const {t} = useTranslation();
    const [phase, setPhase] = useState('idle'); // idle | checking | not-available | available | downloading | downloaded | error
    const [version, setVersion] = useState(null);
    const [releaseNotes, setReleaseNotes] = useState(null);
    const [progress, setProgress] = useState(null); // { percent, transferred, total, bytesPerSecond, etaSeconds }
    const [errorMessage, setErrorMessage] = useState('');
    const [isDevMode, setIsDevMode] = useState(false);

    useEffect(() => {
        const unsubscribe = window.api.updater.onEvent((payload) => {
            switch (payload.type) {
                case 'checking':
                    setPhase('checking');
                    setErrorMessage('');
                    break;
                case 'available':
                    setPhase('available');
                    setVersion(payload.version);
                    setReleaseNotes(payload.releaseNotes || null);
                    break;
                case 'not-available':
                    setPhase('not-available');
                    setVersion(payload.version);
                    break;
                case 'downloading':
                    setPhase('downloading');
                    setProgress(payload);
                    break;
                case 'downloaded':
                    setPhase('downloaded');
                    setVersion(payload.version);
                    if (payload.releaseNotes) setReleaseNotes(payload.releaseNotes);
                    break;
                case 'error':
                    setPhase('error');
                    setErrorMessage(payload.message);
                    break;
                default:
                    break;
            }
        });

        window.api.updater.getState().then((state) => {
            setIsDevMode(!!state.isDev);
            if (state.lastReleaseNotes) setReleaseNotes(state.lastReleaseNotes);
            if (state.downloading) {
                setPhase('downloading');
                return;
            }
            if (state.checking) {
                setPhase('checking');
                return;
            }
            if (state.lastCheckResult) {
                setPhase(state.lastCheckResult.updateAvailable ? 'available' : 'not-available');
                setVersion(state.lastCheckResult.version);
            }
        });

        return unsubscribe;
    }, []);

    async function handleCheck() {
        if (isDevMode) return;
        setErrorMessage('');
        const result = await window.api.updater.check();
        if (!result.ok) {
            if (result.error.startsWith('No published versions on')) {
                setPhase('not-available');
            } else {
                setPhase('error');
                setErrorMessage(result.error);
            }
        }
    }

    async function handleDownload() {
        if (isDevMode) return;
        setErrorMessage('');
        const result = await window.api.updater.download();
        if (!result.ok) {
            setPhase('error');
            setErrorMessage(result.error);
        }
    }

    function handleInstall() {
        if (isDevMode) return;
        window.api.updater.quitAndInstall();
    }

    function handleDevPreview(target) {
        setErrorMessage('');
        setReleaseNotes(null);
        setProgress(null);
        setVersion(null);
        switch (target) {
            case 'idle':
                setPhase('idle');
                break;
            case 'checking':
                setPhase('checking');
                break;
            case 'not-available':
                setPhase('not-available');
                setVersion('1.4.2');
                break;
            case 'available':
                setPhase('available');
                setVersion('1.5.0');
                setReleaseNotes(DEV_SAMPLE_RELEASE_NOTES);
                break;
            case 'downloading':
                setPhase('downloading');
                setProgress({
                    percent: 42,
                    transferred: 42 * 1024 * 1024,
                    total: 100 * 1024 * 1024,
                    bytesPerSecond: 3.2 * 1024 * 1024,
                    etaSeconds: 18
                });
                break;
            case 'downloaded':
                setPhase('downloaded');
                setVersion('1.5.0');
                setReleaseNotes(DEV_SAMPLE_RELEASE_NOTES);
                break;
            case 'error':
                setPhase('error');
                setErrorMessage('Sample error message for preview.');
                break;
            default:
                break;
        }
    }

    return (
        <div className="settings-section">
            <div className="settings-section-head">
                <span className="settings-icon-badge"><i className="fa-solid fa-arrows-rotate"/></span>
                <h3>{t('updaterSection.heading')}</h3>
            </div>

            {isDevMode && (
                <div className="dev-preview-panel">
                    <div className="dev-preview-label">Dev Preview</div>
                    <div className="dev-preview-actions">
                        {DEV_PREVIEW_PHASES.map(({key, label}) => (
                            <button key={key} className={`tiny-btn ${phase === key ? 'is-active' : ''}`}
                                    onClick={() => handleDevPreview(key)}>
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {phase === 'idle' && (
                <button onClick={handleCheck}>{t('updaterSection.checkForUpdates')}</button>
            )}

            {phase === 'checking' && (
                <div className="info-banner">{t('updaterSection.checkingForUpdates')}</div>
            )}

            {phase === 'not-available' && (
                <>
                    <div className="info-banner">{t('updaterSection.upToDate')}{version ? ` (${version})` : ''}</div>
                    <button onClick={handleCheck}>{t('updaterSection.checkAgain')}</button>
                </>
            )}

            {phase === 'available' && (
                <>
                    <div className="info-banner">{t('updaterSection.updateAvailable', {version})}</div>
                    {releaseNotes && (
                        <div className="changelog-box">
                            <Markdown text={releaseNotes}/>
                        </div>
                    )}
                    <button className="primary" onClick={handleDownload}>{t('updaterSection.downloadUpdate')}</button>
                </>
            )}

            {phase === 'downloading' && progress && (
                <div className="update-progress">
                    <div className="update-progress-bar-track">
                        <div className="update-progress-bar-fill" style={{width: `${progress.percent.toFixed(1)}%`}}/>
                    </div>
                    <div className="update-progress-meta">
                        <span>{progress.percent.toFixed(0)}%</span>
                        <span>{formatBytes(progress.transferred)} / {formatBytes(progress.total)}</span>
                        <span>{formatEta(progress.etaSeconds, t)}</span>
                    </div>
                </div>
            )}

            {phase === 'downloaded' && (
                <>
                    <div className="info-banner">{t('updaterSection.downloaded', {version})}</div>
                    {releaseNotes && (
                        <div className="changelog-box">
                            <Markdown text={releaseNotes}/>
                        </div>
                    )}
                    <button className="primary" onClick={handleInstall}>{t('updaterSection.restartAndInstall')}</button>
                </>
            )}

            {phase === 'error' && (
                <>
                    <div className="error-banner">{errorMessage}</div>
                    <button onClick={handleCheck}>{t('updaterSection.tryAgain')}</button>
                </>
            )}
        </div>
    );
}