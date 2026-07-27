const fs = require('fs');
const path = require('path');
const { encrypt, decrypt, makeVerifier, checkVerifier } = require('./crypto');

class SecureStore {
  constructor({ name, cwd }) {
    this.dataPath = path.join(cwd, `${name}.json`);
    this.metaPath = path.join(cwd, `${name}.meta.json`);
    this.data = {};
    this.unlocked = false;
    this.passphrase = null;
    this.meta = this._loadMeta();
    if (!this.meta.encrypted) {
      this.data = this._loadPlain();
      this.unlocked = true;
    }
  }

  _loadMeta() {
    try {
      return JSON.parse(fs.readFileSync(this.metaPath, 'utf-8'));
    } catch {
      return { encrypted: false };
    }
  }

  _persistMeta() {
    fs.mkdirSync(path.dirname(this.metaPath), { recursive: true });
    fs.writeFileSync(this.metaPath, JSON.stringify(this.meta, null, 2), 'utf-8');
  }

  _loadPlain() {
    try {
      return JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'));
    } catch {
      return {};
    }
  }

  _persist() {
    fs.mkdirSync(path.dirname(this.dataPath), { recursive: true });
    if (this.meta.encrypted) {
      if (!this.unlocked) throw new Error('Store is locked; cannot persist');
      const envelope = encrypt(JSON.stringify(this.data), this.passphrase);
      fs.writeFileSync(this.dataPath, JSON.stringify(envelope, null, 2), 'utf-8');
    } else {
      fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2), 'utf-8');
    }
  }

  isEncryptionEnabled() {
    return !!this.meta.encrypted;
  }

  isUnlocked() {
    return this.unlocked;
  }

  /** Sets up encryption for the first time (or changes the passphrase, given the old one already unlocked the store). */
  enableEncryption(passphrase) {
    this.meta.encrypted = true;
    this.meta.verifier = makeVerifier(passphrase);
    this.passphrase = passphrase;
    this.unlocked = true;
    this._persistMeta();
    this._persist();
  }

  /** Removes encryption entirely, writing the current in-memory data back out as plaintext. */
  disableEncryption() {
    this.meta = { encrypted: false };
    this.passphrase = null;
    this._persistMeta();
    this._persist();
  }

  /** Attempts to unlock with a passphrase. Returns true/false, never throws. */
  unlock(passphrase) {
    if (!this.meta.encrypted) return true;
    if (!checkVerifier(this.meta.verifier, passphrase)) return false;
    try {
      const envelope = JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'));
      const plaintext = decrypt(envelope, passphrase);
      this.data = JSON.parse(plaintext);
      this.passphrase = passphrase;
      this.unlocked = true;
      return true;
    } catch {
      return false;
    }
  }

  /** Full factory reset: wipes both files, forgets any passphrase. Used for "forgot my master password". */
  static resetAll(name, cwd) {
    const dataPath = path.join(cwd, `${name}.json`);
    const metaPath = path.join(cwd, `${name}.meta.json`);
    for (const p of [dataPath, metaPath]) {
      try { fs.unlinkSync(p); } catch { /* noop */ }
    }
  }

  get(key, defaultValue) {
    return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : defaultValue;
  }

  set(key, value) {
    this.data[key] = value;
    this._persist();
  }
}

module.exports = SecureStore;
