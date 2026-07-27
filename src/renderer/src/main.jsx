import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { ConfirmProvider } from './components/ConfirmProvider.jsx';

createRoot(document.getElementById('root')).render(
    <ErrorBoundary>
        <ConfirmProvider>
            <App />
        </ConfirmProvider>
    </ErrorBoundary>
);