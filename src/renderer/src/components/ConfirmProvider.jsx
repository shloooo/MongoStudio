import React, {createContext, useCallback, useContext, useRef, useState} from 'react';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
    const [state, setState] = useState(null);
    const resolverRef = useRef(null);

    const confirm = useCallback((message, opts = {}) => {
        if (resolverRef.current) {
            resolverRef.current(false);
            resolverRef.current = null;
        }
        return new Promise((resolve) => {
            resolverRef.current = resolve;
            setState({
                message,
                title: opts.title || 'Please confirm',
                confirmLabel: opts.confirmLabel || 'Confirm',
                cancelLabel: opts.cancelLabel || 'Cancel',
                danger: opts.danger !== undefined ? opts.danger : true
            });
        });
    }, []);

    function settle(result) {
        setState(null);
        if (resolverRef.current) {
            resolverRef.current(result);
            resolverRef.current = null;
        }
    }

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            {state && (
                <div className="modal-backdrop confirm-backdrop" onClick={() => settle(false)}>
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
        </ConfirmContext.Provider>
    );
}

export function useConfirm() {
    const ctx = useContext(ConfirmContext);
    if (!ctx) throw new Error('useConfirm() must be used within a <ConfirmProvider>');
    return ctx;
}