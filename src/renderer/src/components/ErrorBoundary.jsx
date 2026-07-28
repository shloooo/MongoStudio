import React from 'react';
import {withTranslation} from 'react-i18next';
import {reportError} from '../lib/errorBus.js';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {hasError: false, message: ''};
    }

    static getDerivedStateFromError(error) {
        return {hasError: true, message: error?.message || String(error)};
    }

    componentDidCatch(error) {
        reportError(error?.message || String(error), 'Render');
    }

    render() {
        if (this.state.hasError) {
            const {t} = this.props;
            return (
                <div className="fatal-error-screen">
                    <h2>{t('dialogs.errorBoundary.heading')}</h2>
                    <p>{this.state.message}</p>
                    <button className="primary" onClick={() => window.location.reload()}>{t('dialogs.errorBoundary.reload')}</button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default withTranslation()(ErrorBoundary);