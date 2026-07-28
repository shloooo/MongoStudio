import React from 'react';
import {withTranslation} from 'react-i18next';
import {reportError} from '../lib/errorBus.js';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            hasError: false,
            message: '',
            stack: '',
            appVersion: null,
            appCommit: null,
            isDev: false,
            detailsOpen: false,
            copied: false
        };
    }

    static getDerivedStateFromError(error) {
        return {
            hasError: true,
            message: error?.message || String(error),
            stack: error?.stack || ''
        };
    }

    componentDidCatch(error) {
        reportError(error?.message || String(error), 'Render');
        if (window.api?.app?.getInfo) {
            window.api.app.getInfo()
                .then((info) => {
                    this.setState({
                        appVersion: info?.version || null,
                        appCommit: info?.commit || null,
                        isDev: !!info?.isDev
                    });
                })
                .catch(() => {});
        }
    }

    toggleDetails = () => {
        this.setState((s) => ({detailsOpen: !s.detailsOpen}));
    };

    handleReload = () => {
        window.location.reload();
    };

    handleRestart = () => {
        if (window.api?.app?.relaunch) {
            window.api.app.relaunch();
        } else {
            window.location.reload();
        }
    };

    handleCopy = () => {
        const {message, stack, appVersion, appCommit} = this.state;
        const details = [
            `Version: ${appVersion || 'n/a'}${appCommit ? ` (${appCommit})` : ''}`,
            `Error: ${message}`,
            stack ? `\nStack:\n${stack}` : ''
        ].join('\n');
        navigator.clipboard?.writeText(details)
            .then(() => {
                this.setState({copied: true});
                setTimeout(() => this.setState({copied: false}), 2000);
            })
            .catch(() => {});
    };

    render() {
        if (this.state.hasError) {
            const {t} = this.props;
            const {message, stack, appVersion, appCommit, isDev, detailsOpen, copied} = this.state;
            return (
                <div className="fatal-error-screen">
                    <div className="fatal-error-card">
                        <div className="fatal-error-icon">
                            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 9v4M12 17h.01M10.29 3.86l-8.18 14.18A2 2 0 0 0 3.82 21h16.36a2 2 0 0 0 1.71-2.96L13.71 3.86a2 2 0 0 0-3.42 0z"
                                      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </div>

                        <div className="fatal-error-heading-row">
                            <h2>{t('dialogs.errorBoundary.heading')}</h2>
                        </div>

                        <p className="fatal-error-subtext">{t('dialogs.errorBoundary.subtext')}</p>

                        <div className="fatal-error-message-box">
                            <span className="fatal-error-message-label">{t('dialogs.errorBoundary.errorLabel')}</span>
                            <span className="fatal-error-message-text">{message}</span>
                        </div>

                        {(appVersion || stack) && (
                            <div className="fatal-error-meta">
                                {appVersion && (
                                    <span>{t('dialogs.errorBoundary.versionLabel')}: {appVersion}</span>
                                )}
                                {appCommit && (
                                    <span>{t('dialogs.errorBoundary.commitLabel')}: {appCommit}</span>
                                )}
                            </div>
                        )}

                        {stack && (
                            <div className="fatal-error-details">
                                <button className="fatal-error-details-toggle" onClick={this.toggleDetails}>
                                    <i className={`fa-solid fa-chevron-right twisty ${detailsOpen ? 'is-expanded' : ''}`}/>
                                    {t('dialogs.errorBoundary.detailsToggle')}
                                </button>
                                {detailsOpen && <pre className="fatal-error-stack">{stack}</pre>}
                            </div>
                        )}

                        <div className="fatal-error-actions">
                            <button onClick={this.handleCopy}>
                                {copied ? t('dialogs.errorBoundary.copied') : t('dialogs.errorBoundary.copyDetails')}
                            </button>
                            {isDev ? (
                                <button className="primary" onClick={this.handleReload}>{t('dialogs.errorBoundary.reload')}</button>
                            ) : (
                                <button className="primary" onClick={this.handleRestart}>{t('dialogs.errorBoundary.restart')}</button>
                            )}
                        </div>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

export default withTranslation()(ErrorBoundary);