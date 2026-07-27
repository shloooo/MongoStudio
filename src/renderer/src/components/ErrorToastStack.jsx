import React, {useEffect, useState} from 'react';
import {subscribeErrors} from '../lib/errorBus.js';

const AUTO_DISMISS_MS = 12000;

export default function ErrorToastStack() {
    const [toasts, setToasts] = useState([]);

    useEffect(() => {
        return subscribeErrors((entry) => {
            setToasts((prev) => [...prev, entry]);
            setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== entry.id));
            }, AUTO_DISMISS_MS);
        });
    }, []);

    function dismiss(id) {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }

    if (toasts.length === 0) return null;

    return (
        <div className="error-toast-stack">
            {toasts.map((t) => (
                <div key={t.id} className="error-toast">
                    <span className="error-toast-icon">⚠</span>
                    <div className="error-toast-body">
                        <div className="error-toast-title">{t.source ? `Error · ${t.source}` : 'Error'}</div>
                        <div className="error-toast-message">{t.message}</div>
                    </div>
                    <button className="error-toast-close" onClick={() => dismiss(t.id)} title="Dismiss">×</button>
                </div>
            ))}
        </div>
    );
}