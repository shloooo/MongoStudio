import React, {useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';

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

export default function UpdaterSection() {
    const {t} = useTranslation();
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
            if (state.isDev) {
                setPhase('disabled');
                return;
            }
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
        return "";
    }

    return (
        <div className="settings-section">
            <h3>{t('updaterSection.heading')}</h3>

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