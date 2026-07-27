import React, { useState } from 'react';

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
  const [form, setForm] = useState({ ...EMPTY, ...(initial || {}), ssh: { ...EMPTY.ssh, ...(initial?.ssh || {}) } });
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

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
    onSave(form);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial ? 'Edit Connection' : 'New Connection'}</h3>
        <form onSubmit={handleSubmit}>
          <label>Name</label>
          <input value={form.name} onChange={(e) => update('name', e.target.value)} required />

          <div className="mode-toggle">
            <label>
              <input type="radio" checked={form.mode === 'basic'} onChange={() => update('mode', 'basic')} />
              Host / Port
            </label>
            <label>
              <input type="radio" checked={form.mode === 'uri'} onChange={() => update('mode', 'uri')} />
              Connection String
            </label>
          </div>

          {form.mode === 'uri' ? (
            <>
              <label>Connection String</label>
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
                  <label>Host</label>
                  <input value={form.host} onChange={(e) => update('host', e.target.value)} />
                </div>
                <div>
                  <label>Port</label>
                  <input type="number" value={form.port} onChange={(e) => update('port', Number(e.target.value))} />
                </div>
              </div>
              <div className="row">
                <div>
                  <label>Username</label>
                  <input value={form.username} onChange={(e) => update('username', e.target.value)} />
                </div>
                <div>
                  <label>Password</label>
                  <input type="password" value={form.password} onChange={(e) => update('password', e.target.value)} />
                </div>
              </div>
              <div className="row">
                <div>
                  <label>Auth Source</label>
                  <input value={form.authSource} onChange={(e) => update('authSource', e.target.value)} />
                </div>
                <div>
                  <label>Replica Set</label>
                  <input value={form.replicaSet} onChange={(e) => update('replicaSet', e.target.value)} />
                </div>
              </div>
              <div className="row checkboxes">
                <label><input type="checkbox" checked={form.srv} onChange={(e) => update('srv', e.target.checked)} /> SRV (mongodb+srv)</label>
                <label><input type="checkbox" checked={form.tls} onChange={(e) => update('tls', e.target.checked)} /> TLS/SSL</label>
              </div>
            </>
          )}

          <div className="section-divider" />

          <label className="section-toggle">
            <input type="checkbox" checked={form.useSsh} onChange={(e) => update('useSsh', e.target.checked)} />
            Connect via SSH tunnel
          </label>

          {form.useSsh && (
            <div className="ssh-section">
              <div className="row">
                <div>
                  <label>SSH Host</label>
                  <input value={form.ssh.host} onChange={(e) => updateSsh('host', e.target.value)} placeholder="bastion.example.com" />
                </div>
                <div>
                  <label>SSH Port</label>
                  <input type="number" value={form.ssh.port} onChange={(e) => updateSsh('port', Number(e.target.value))} />
                </div>
              </div>
              <label>SSH Username</label>
              <input value={form.ssh.username} onChange={(e) => updateSsh('username', e.target.value)} />

              <div className="mode-toggle">
                <label>
                  <input type="radio" checked={form.ssh.authType === 'password'} onChange={() => updateSsh('authType', 'password')} />
                  Password
                </label>
                <label>
                  <input type="radio" checked={form.ssh.authType === 'key'} onChange={() => updateSsh('authType', 'key')} />
                  Private Key
                </label>
              </div>

              {form.ssh.authType === 'password' ? (
                <>
                  <label>SSH Password</label>
                  <input type="password" value={form.ssh.password} onChange={(e) => updateSsh('password', e.target.value)} />
                </>
              ) : (
                <>
                  <label>Private Key File</label>
                  <div className="file-picker-row">
                    <input value={form.ssh.privateKeyPath} onChange={(e) => updateSsh('privateKeyPath', e.target.value)} placeholder="~/.ssh/id_ed25519" />
                    <button type="button" onClick={handlePickKey}>Browse...</button>
                  </div>
                  <label>Passphrase (optional)</label>
                  <input type="password" value={form.ssh.passphrase} onChange={(e) => updateSsh('passphrase', e.target.value)} />
                </>
              )}
              <p className="hint-text">MongoDB host/port above is resolved on the remote side of the tunnel.</p>
            </div>
          )}

          {testResult && (
            <div className={`test-result ${testResult.ok ? 'ok' : 'error'}`}>
              {testResult.ok ? 'Connection successful' : `Error: ${testResult.error}`}
            </div>
          )}

          <div className="modal-actions">
            <button type="button" onClick={handleTest} disabled={testing}>
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            <div className="spacer" />
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}
