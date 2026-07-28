import React from 'react';
import { createRoot } from 'react-dom/client';
import i18n from './i18n/index.js';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { ConfirmProvider } from './components/ConfirmProvider.jsx';

async function bootstrap() {
    try {
        const settings = await window.api.settings.get();
        if (settings?.language) await i18n.changeLanguage(settings.language);
    } catch {
        // fall back to default language
    }

    createRoot(document.getElementById('root')).render(
        <ErrorBoundary>
            <ConfirmProvider>
                <App />
            </ConfirmProvider>
        </ErrorBoundary>
    );
}

bootstrap();