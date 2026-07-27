import React from 'react';
import {reportError} from '../lib/errorBus.js';

export default class ErrorBoundary extends React.Component {
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
            return (
                <div className="fatal-error-screen">
                    <h2>Something went wrong</h2>
                    <p>{this.state.message}</p>
                    <button className="primary" onClick={() => window.location.reload()}>Reload</button>
                </div>
            );
        }
        return this.props.children;
    }
}