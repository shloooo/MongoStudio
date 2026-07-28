import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export default function VaultGate({ onUnlocked }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState(null); // null | { encryptionEnabled, unlocked }
  const [mode, setMode] = useState('unlock'); // 'unlock' | 'reset-confirm'
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.api.vault.status().then((s) => {
      setStatus(s);
      if (!s.encryptionEnabled) {
        onUnlocked();
      } else {
        setMode('unlock');
      }
    });
  }, []);

  async function handleUnlock(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const ok = await window.api.vault.unlock(passphrase);
    setBusy(false);
    if (ok) onUnlocked();
    else setError(t('dialogs.vaultGate.incorrect'));
  }

  async function handleReset() {
    setBusy(true);
    await window.api.vault.reset();
    setBusy(false);
    onUnlocked();
  }

  if (status === null) return null;

  return (
      <div className="vault-gate">
        <div className="vault-card">
          {mode === 'unlock' && (
              <>
                <div className="vault-icon">
                  <i className="fa-solid fa-lock" />
                </div>
                <h2>{t('dialogs.vaultGate.lockedHeading')}</h2>
                <p className="hint-text">{t('dialogs.vaultGate.lockedHint')}</p>

                <form onSubmit={handleUnlock}>
                  <div className="vault-password-field">
                    <input
                        type={showPassphrase ? 'text' : 'password'}
                        autoFocus
                        value={passphrase}
                        onChange={(e) => { setPassphrase(e.target.value); setError(''); }}
                        placeholder={t('dialogs.vaultGate.placeholder')}
                        className={error ? 'has-error' : ''}
                    />
                    <button
                        type="button"
                        className="vault-password-toggle"
                        onClick={() => setShowPassphrase((v) => !v)}
                        tabIndex={-1}
                        aria-label={t(showPassphrase ? 'dialogs.vaultGate.hidePassword' : 'dialogs.vaultGate.showPassword')}
                    >
                      <i className={`fa-solid ${showPassphrase ? 'fa-eye-slash' : 'fa-eye'}`} />
                    </button>
                  </div>

                  {error && (
                      <div className="error-banner">
                        <i className="fa-solid fa-circle-exclamation" /> {error}
                      </div>
                  )}

                  <div className="vault-actions">
                    <button type="submit" className="primary" disabled={busy || !passphrase}>
                      {busy ? (
                          <>
                            <i className="fa-solid fa-circle-notch fa-spin" /> {t('dialogs.vaultGate.unlocking')}
                          </>
                      ) : (
                          <>
                            <i className="fa-solid fa-lock-open" /> {t('dialogs.vaultGate.unlock')}
                          </>
                      )}
                    </button>
                  </div>
                </form>

                <button className="link-btn" onClick={() => setMode('reset-confirm')}>
                  {t('dialogs.vaultGate.forgotPassword')}
                </button>
              </>
          )}

          {mode === 'reset-confirm' && (
              <>
                <div className="vault-icon vault-icon-danger">
                  <i className="fa-solid fa-triangle-exclamation" />
                </div>
                <h2>{t('dialogs.vaultGate.resetHeading')}</h2>
                <p className="hint-text">{t('dialogs.vaultGate.resetHint')}</p>

                <div className="vault-actions">
                  <button onClick={() => setMode('unlock')} disabled={busy}>
                    {t('dialogs.vaultGate.cancel')}
                  </button>
                  <button className="danger" onClick={handleReset} disabled={busy}>
                    {busy ? (
                        <>
                          <i className="fa-solid fa-circle-notch fa-spin" /> {t('dialogs.vaultGate.resetting')}
                        </>
                    ) : (
                        <>
                          <i className="fa-solid fa-trash-can" /> {t('dialogs.vaultGate.resetEverything')}
                        </>
                    )}
                  </button>
                </div>
              </>
          )}
        </div>
      </div>
  );
}