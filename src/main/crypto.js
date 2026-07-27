const crypto = require('crypto');

const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BYTES = 32;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function deriveKey(passphrase, salt) {
  return crypto.scryptSync(passphrase, salt, KEY_BYTES, SCRYPT_OPTS);
}

function encrypt(plaintext, passphrase) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const iv = crypto.randomBytes(IV_BYTES);
  const key = deriveKey(passphrase, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    ciphertext: ciphertext.toString('hex')
  };
}

function decrypt(envelope, passphrase) {
  const salt = Buffer.from(envelope.salt, 'hex');
  const iv = Buffer.from(envelope.iv, 'hex');
  const tag = Buffer.from(envelope.tag, 'hex');
  const ciphertext = Buffer.from(envelope.ciphertext, 'hex');
  const key = deriveKey(passphrase, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf-8');
}

function makeVerifier(passphrase) {
  return encrypt('mongostudio-verify', passphrase);
}

function checkVerifier(envelope, passphrase) {
  try {
    return decrypt(envelope, passphrase) === 'mongostudio-verify';
  } catch {
    return false;
  }
}

module.exports = { encrypt, decrypt, makeVerifier, checkVerifier };
