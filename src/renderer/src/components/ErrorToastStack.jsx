import React, {useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {subscribeErrors} from '../lib/errorBus.js';

const AUTO_DISMISS_MS = 12000;

export default function ErrorToastStack() {
    const {t} = useTranslation();
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
            {toasts.map((toast) => (
                <div key={toast.id} className="error-toast">
                    <span className="error-toast-icon">⚠</span>
                    <div className="error-toast-body">
                        <div className="error-toast-title">{toast.source ? t('dialogs.errorToast.errorWithSource', {source: toast.source}) : t('dialogs.errorToast.error')}</div>
                        <div className="error-toast-message">{toast.message}</div>
                    </div>
                    <button className="error-toast-close" onClick={() => dismiss(toast.id)} title={t('dialogs.errorToast.dismiss')}>×</button>
                </div>
            ))}
        </div>
    );
}