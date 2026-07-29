import React, {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useClosing} from '../lib/useClosing.js';

const EMPTY = {
  id: null,
  name: '',
  mode: 'basic',
  uri: '',
  host: 'localhost',
  port: 27017,
  username: '',
  password: '',
  authSource: 'admin',
  srv: false,
  tls: false,
  replicaSet: '',
  useSsh: false,
  ssh: {
    host: '',
    port: 22,
    username: '',
    authType: 'password',
    password: '',
    privateKeyPath: '',
    passphrase: ''
  }
};

export default function ConnectionDialog({ initial, onSave, onClose }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ ...EMPTY, ...(initial || {}), ssh: { ...EMPTY.ssh, ...(initial?.ssh || {}) } });
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const {closing, requestClose} = useClosing(onClose);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setTestResult(null);
  }

  function updateSsh(field, value) {
    setForm((f) => ({ ...f, ssh: { ...f.ssh, [field]: value } }));
    setTestResult(null);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    const result = await window.api.conn.test(form);
    setTestResult(result);
    setTesting(false);
  }

  async function handlePickKey() {
    const path = await window.api.conn.pickPrivateKey();
    if (path) updateSsh('privateKeyPath', path);
  }

  function handleSubmit(e) {
    e.preventDefault();
    requestClose(() => onSave(form));
  }

  return (
      <div className={`modal-backdrop ${closing ? 'is-closing' : ''}`} onClick={() => requestClose()}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3>{initial ? t('dialogs.connection.editTitle') : t('dialogs.connection.newTitle')}</h3>
          <form onSubmit={handleSubmit}>
            <label>{t('dialogs.connection.name')}</label>
            <input value={form.name} onChange={(e) => update('name', e.target.value)} required />

            <div className="mode-toggle">
              <label>
                <input type="radio" checked={form.mode === 'basic'} onChange={() => update('mode', 'basic')} />
                {t('dialogs.connection.hostPort')}
              </label>
              <label>
                <input type="radio" checked={form.mode === 'uri'} onChange={() => update('mode', 'uri')} />
                {t('dialogs.connection.connectionString')}
              </label>
            </div>

            {form.mode === 'uri' ? (
                <>
                  <label>{t('dialogs.connection.connectionString')}</label>
                  <input
                      value={form.uri}
                      onChange={(e) => update('uri', e.target.value)}
                      placeholder="mongodb+srv://user:pass@cluster.mongodb.net/"
                  />
                </>
            ) : (
                <>
                  <div className="row">
                    <div>
                      <label>{t('dialogs.connection.host')}</label>
                      <input value={form.host} onChange={(e) => update('host', e.target.value)} />
                    </div>
                    <div>
                      <label>{t('dialogs.connection.port')}</label>
                      <input type="number" value={form.port} onChange={(e) => update('port', Number(e.target.value))} />
                    </div>
                  </div>
                  <div className="row">
                    <div>
                      <label>{t('dialogs.connection.username')}</label>
                      <input value={form.username} onChange={(e) => update('username', e.target.value)} />
                    </div>
                    <div>
                      <label>{t('dialogs.connection.password')}</label>
                      <input type="password" value={form.password} onChange={(e) => update('password', e.target.value)} />
                    </div>
                  </div>
                  <div className="row">
                    <div>
                      <label>{t('dialogs.connection.authSource')}</label>
                      <input value={form.authSource} onChange={(e) => update('authSource', e.target.value)} />
                    </div>
                    <div>
                      <label>{t('dialogs.connection.replicaSet')}</label>
                      <input value={form.replicaSet} onChange={(e) => update('replicaSet', e.target.value)} />
                    </div>
                  </div>
                  <div className="row checkboxes">
                    <label><input type="checkbox" checked={form.srv} onChange={(e) => update('srv', e.target.checked)} /> {t('dialogs.connection.srv')}</label>
                    <label><input type="checkbox" checked={form.tls} onChange={(e) => update('tls', e.target.checked)} /> {t('dialogs.connection.tls')}</label>
                  </div>
                </>
            )}

            <div className="section-divider" />

            <label className="section-toggle">
              <input type="checkbox" checked={form.useSsh} onChange={(e) => update('useSsh', e.target.checked)} />
              {t('dialogs.connection.sshToggle')}
            </label>

            {form.useSsh && (
                <div className="ssh-section">
                  <div className="row">
                    <div>
                      <label>{t('dialogs.connection.sshHost')}</label>
                      <input value={form.ssh.host} onChange={(e) => updateSsh('host', e.target.value)} placeholder="bastion.example.com" />
                    </div>
                    <div>
                      <label>{t('dialogs.connection.sshPort')}</label>
                      <input type="number" value={form.ssh.port} onChange={(e) => updateSsh('port', Number(e.target.value))} />
                    </div>
                  </div>
                  <label>{t('dialogs.connection.sshUsername')}</label>
                  <input value={form.ssh.username} onChange={(e) => updateSsh('username', e.target.value)} />

                  <div className="mode-toggle">
                    <label>
                      <input type="radio" checked={form.ssh.authType === 'password'} onChange={() => updateSsh('authType', 'password')} />
                      {t('dialogs.connection.sshAuthPassword')}
                    </label>
                    <label>
                      <input type="radio" checked={form.ssh.authType === 'key'} onChange={() => updateSsh('authType', 'key')} />
                      {t('dialogs.connection.sshAuthKey')}
                    </label>
                  </div>

                  {form.ssh.authType === 'password' ? (
                      <>
                        <label>{t('dialogs.connection.sshPassword')}</label>
                        <input type="password" value={form.ssh.password} onChange={(e) => updateSsh('password', e.target.value)} />
                      </>
                  ) : (
                      <>
                        <label>{t('dialogs.connection.privateKeyFile')}</label>
                        <div className="file-picker-row">
                          <input value={form.ssh.privateKeyPath} onChange={(e) => updateSsh('privateKeyPath', e.target.value)} placeholder="~/.ssh/id_ed25519" />
                          <button type="button" onClick={handlePickKey}>{t('dialogs.connection.browse')}</button>
                        </div>
                        <label>{t('dialogs.connection.passphrase')}</label>
                        <input type="password" value={form.ssh.passphrase} onChange={(e) => updateSsh('passphrase', e.target.value)} />
                      </>
                  )}
                  <p className="hint-text">{t('dialogs.connection.sshHint')}</p>
                </div>
            )}

            {testResult && (
                <div className={`test-result ${testResult.ok ? 'ok' : 'error'}`}>
                  {testResult.ok ? t('dialogs.connection.testSuccess') : t('dialogs.connection.testError', { error: testResult.error })}
                </div>
            )}

            <div className="modal-actions">
              <button type="button" onClick={handleTest} disabled={testing}>
                {testing ? t('dialogs.connection.testing') : t('dialogs.connection.testConnection')}
              </button>
              <div className="spacer" />
              <button type="button" onClick={() => requestClose()}>{t('dialogs.common.cancel')}</button>
              <button type="submit" className="primary">{t('dialogs.common.save')}</button>
            </div>
          </form>
        </div>
      </div>
  );
}