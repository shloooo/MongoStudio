import React from 'react';
import {createRoot} from 'react-dom/client';
import i18n from './i18n/index.js';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import {ConfirmProvider} from './components/ConfirmProvider.jsx';
import {TaskQueueProvider} from './components/TaskQueueProvider.jsx';

async function bootstrap() {
    try {
        const settings = await window.api.settings.get();
        if (settings?.language) await i18n.changeLanguage(settings.language);
        if (settings?.theme === 'dark') document.body.classList.add('dark');
        if (settings?.glassIntensity != null) {
            document.documentElement.style.setProperty('--glass-intensity', settings.glassIntensity);
        }
    } catch {
        // fall back to default language/theme
    }

    createRoot(document.getElementById('root')).render(
        <ErrorBoundary>
            <ConfirmProvider>
                <TaskQueueProvider>
                    <App/>
                </TaskQueueProvider>
            </ConfirmProvider>
        </ErrorBoundary>
    );
}

bootstrap();