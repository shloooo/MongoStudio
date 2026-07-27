import React, { useState, useEffect } from 'react';

export default function VaultGate({ onUnlocked }) {
  const [status, setStatus] = useState(null); // null | { encryptionEnabled, unlocked }
  const [mode, setMode] = useState('unlock'); // 'unlock' | 'reset-confirm'
  const [passphrase, setPassphrase] = useState('');
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
    else setError('Incorrect master password.');
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
        <div className="vault-icon">🔒</div>
        {mode === 'unlock' && (
          <>
            <h2>MongoStudio is locked</h2>
            <p className="hint-text">Enter your master password to unlock your saved connections.</p>
            <form onSubmit={handleUnlock}>
              <input
                type="password"
                autoFocus
                value={passphrase}
                onChange={(e) => { setPassphrase(e.target.value); setError(''); }}
                placeholder="Master password"
              />
              {error && <div className="error-banner">{error}</div>}
              <div className="vault-actions">
                <button type="submit" className="primary" disabled={busy || !passphrase}>
                  {busy ? 'Unlocking...' : 'Unlock'}
                </button>
              </div>
            </form>
            <button className="link-btn" onClick={() => setMode('reset-confirm')}>Forgot your master password?</button>
          </>
        )}

        {mode === 'reset-confirm' && (
          <>
            <h2>Reset all data?</h2>
            <p className="hint-text">
              This permanently deletes all saved connections and disables the master password.
              There is no way to recover the encrypted data without the password. This cannot be undone.
            </p>
            <div className="vault-actions">
              <button onClick={() => setMode('unlock')}>Cancel</button>
              <button className="danger" onClick={handleReset} disabled={busy}>
                {busy ? 'Resetting...' : 'Reset everything'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
