import React, {useEffect, useState} from 'react';

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

function formatEta(seconds) {
    if (seconds === null || seconds === undefined) return 'calculating...';
    if (seconds < 1) return 'almost done';
    if (seconds < 60) return `${Math.ceil(seconds)}s remaining`;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.ceil(seconds % 60);
    return `${minutes}m ${secs}s remaining`;
}

export default function UpdaterSection() {
    const [phase, setPhase] = useState('idle'); // idle | checking | not-available | available | downloading | downloaded | error | disabled
    const [version, setVersion] = useState(null);
    const [progress, setProgress] = useState(null); // { percent, transferred, total, bytesPerSecond, etaSeconds }
    const [errorMessage, setErrorMessage] = useState('');

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
            if (state.isDev) setPhase('disabled');
        });

        return unsubscribe;
    }, []);

    async function handleCheck() {
        setErrorMessage('');
        const result = await window.api.updater.check();
        if (!result.ok) {
            setPhase('error');
            setErrorMessage(result.error);
        }
    }

    async function handleDownload() {
        setErrorMessage('');
        const result = await window.api.updater.download();
        if (!result.ok) {
            setPhase('error');
            setErrorMessage(result.error);
        }
    }

    function handleInstall() {
        window.api.updater.quitAndInstall();
    }

    if (phase === 'disabled') {
        return (
            <div className="settings-section">
                <h3>Updates</h3>
                <p className="settings-section-desc">This feature is disabled. Start MongoStudio in prod mode to enable this feature.</p>
            </div>
        );
    }

    return (
        <div className="settings-section">
            <h3>Updates</h3>
            <p className="settings-section-desc">Check GitHub Releases for a newer version of MongoStudio.</p>

            {phase === 'idle' && (
                <button onClick={handleCheck}>Check for updates</button>
            )}

            {phase === 'checking' && (
                <div className="info-banner">Checking for updates...</div>
            )}

            {phase === 'not-available' && (
                <>
                    <div className="info-banner">You're up to date{version ? ` (${version})` : ''}.</div>
                    <button onClick={handleCheck}>Check again</button>
                </>
            )}

            {phase === 'available' && (
                <>
                    <div className="info-banner">Update available: version {version}.</div>
                    <button className="primary" onClick={handleDownload}>Download update</button>
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
                        <span>{formatEta(progress.etaSeconds)}</span>
                    </div>
                </div>
            )}

            {phase === 'downloaded' && (
                <>
                    <div className="info-banner">Update {version} downloaded. Restart to install.</div>
                    <button className="primary" onClick={handleInstall}>Restart and install</button>
                </>
            )}

            {phase === 'error' && (
                <>
                    <div className="error-banner">{errorMessage}</div>
                    <button onClick={handleCheck}>Try again</button>
                </>
            )}
        </div>
    );
}