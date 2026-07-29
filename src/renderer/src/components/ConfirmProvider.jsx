import React, {createContext, useCallback, useContext, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';

const ConfirmContext = createContext(null);
const PromptContext = createContext(null);

export function ConfirmProvider({ children }) {
    const { t } = useTranslation();
    const [state, setState] = useState(null);
    const resolverRef = useRef(null);
    const stateTokenRef = useRef(0);

    const [promptState, setPromptState] = useState(null);
    const [promptValue, setPromptValue] = useState('');
    const promptResolverRef = useRef(null);
    const promptTokenRef = useRef(0);

    const confirm = useCallback((message, opts = {}) => {
        if (resolverRef.current) {
            resolverRef.current(false);
            resolverRef.current = null;
        }
        stateTokenRef.current += 1;
        return new Promise((resolve) => {
            resolverRef.current = resolve;
            setState({
                message,
                title: opts.title || t('dialogs.confirm.defaultTitle'),
                confirmLabel: opts.confirmLabel || t('dialogs.confirm.defaultConfirm'),
                cancelLabel: opts.cancelLabel || t('dialogs.confirm.defaultCancel'),
                danger: opts.danger !== undefined ? opts.danger : true
            });
        });
    }, [t]);

    function settle(result) {
        if (!state || state.closing) return;
        const token = stateTokenRef.current;
        setState((s) => ({ ...s, closing: true }));
        setTimeout(() => {
            if (stateTokenRef.current !== token) return;
            setState(null);
            if (resolverRef.current) {
                resolverRef.current(result);
                resolverRef.current = null;
            }
        }, 150);
    }

    const prompt = useCallback((message, opts = {}) => {
        if (promptResolverRef.current) {
            promptResolverRef.current(null);
            promptResolverRef.current = null;
        }
        promptTokenRef.current += 1;
        return new Promise((resolve) => {
            promptResolverRef.current = resolve;
            setPromptValue(opts.defaultValue || '');
            setPromptState({
                message,
                title: opts.title || t('dialogs.prompt.defaultTitle'),
                confirmLabel: opts.confirmLabel || t('dialogs.prompt.defaultConfirm'),
                cancelLabel: opts.cancelLabel || t('dialogs.prompt.defaultCancel'),
                placeholder: opts.placeholder || ''
            });
        });
    }, [t]);

    function settlePrompt(result) {
        if (!promptState || promptState.closing) return;
        const token = promptTokenRef.current;
        setPromptState((s) => ({ ...s, closing: true }));
        setTimeout(() => {
            if (promptTokenRef.current !== token) return;
            setPromptState(null);
            if (promptResolverRef.current) {
                promptResolverRef.current(result);
                promptResolverRef.current = null;
            }
        }, 150);
    }

    return (
        <ConfirmContext.Provider value={confirm}>
            <PromptContext.Provider value={prompt}>
                {children}
                {state && (
                    <div className={`modal-backdrop confirm-backdrop ${state.closing ? 'is-closing' : ''}`} onClick={() => settle(false)}>
                        <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
                            <h3>{state.title}</h3>
                            <p className="confirm-message">{state.message}</p>
                            <div className="modal-actions">
                                <div className="spacer" />
                                <button onClick={() => settle(false)}>{state.cancelLabel}</button>
                                <button className={state.danger ? 'danger' : 'primary'} autoFocus onClick={() => settle(true)}>
                                    {state.confirmLabel}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                {promptState && (
                    <div className={`modal-backdrop confirm-backdrop ${promptState.closing ? 'is-closing' : ''}`} onClick={() => settlePrompt(null)}>
                        <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
                            <h3>{promptState.title}</h3>
                            <p className="confirm-message">{promptState.message}</p>
                            <input
                                autoFocus
                                value={promptValue}
                                placeholder={promptState.placeholder}
                                onChange={(e) => setPromptValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && promptValue.trim()) settlePrompt(promptValue.trim());
                                    if (e.key === 'Escape') settlePrompt(null);
                                }}
                            />
                            <div className="modal-actions">
                                <div className="spacer" />
                                <button onClick={() => settlePrompt(null)}>{promptState.cancelLabel}</button>
                                <button
                                    className="primary"
                                    disabled={!promptValue.trim()}
                                    onClick={() => settlePrompt(promptValue.trim())}
                                >
                                    {promptState.confirmLabel}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </PromptContext.Provider>
        </ConfirmContext.Provider>
    );
}

export function useConfirm() {
    const ctx = useContext(ConfirmContext);
    if (!ctx) throw new Error('useConfirm() must be used within a <ConfirmProvider>');
    return ctx;
}

export function usePrompt() {
    const ctx = useContext(PromptContext);
    if (!ctx) throw new Error('usePrompt() must be used within a <ConfirmProvider>');
    return ctx;
}