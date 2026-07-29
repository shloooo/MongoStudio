import fs from 'node:fs';
import path from 'node:path';
import {checkVerifier, type CryptoEnvelope, decrypt, encrypt, makeVerifier} from './crypto.js';

interface StoreMeta {
    encrypted: boolean;
    verifier?: CryptoEnvelope;
}

export default class SecureStore {
    private readonly dataPath: string;
    private readonly metaPath: string;
    private data: Record<string, any>;
    private unlocked: boolean;
    private passphrase: string | null;
    private meta: StoreMeta;

    constructor({name, cwd}: { name: string; cwd: string }) {
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

    private _loadMeta(): StoreMeta {
        try {
            return JSON.parse(fs.readFileSync(this.metaPath, 'utf-8'));
        } catch {
            return {encrypted: false};
        }
    }

    private _persistMeta(): void {
        fs.mkdirSync(path.dirname(this.metaPath), {recursive: true});
        fs.writeFileSync(this.metaPath, JSON.stringify(this.meta, null, 2), 'utf-8');
    }

    private _loadPlain(): Record<string, any> {
        try {
            return JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'));
        } catch {
            return {};
        }
    }

    private _persist(): void {
        fs.mkdirSync(path.dirname(this.dataPath), {recursive: true});
        if (this.meta.encrypted) {
            if (!this.unlocked) throw new Error('Store is locked; cannot persist');
            const envelope = encrypt(JSON.stringify(this.data), this.passphrase!);
            fs.writeFileSync(this.dataPath, JSON.stringify(envelope, null, 2), 'utf-8');
        } else {
            fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2), 'utf-8');
        }
    }

    isEncryptionEnabled(): boolean {
        return !!this.meta.encrypted;
    }

    isUnlocked(): boolean {
        return this.unlocked;
    }

    enableEncryption(passphrase: string): void {
        this.meta.encrypted = true;
        this.meta.verifier = makeVerifier(passphrase);
        this.passphrase = passphrase;
        this.unlocked = true;
        this._persistMeta();
        this._persist();
    }

    disableEncryption(): void {
        this.meta = {encrypted: false};
        this.passphrase = null;
        this._persistMeta();
        this._persist();
    }

    unlock(passphrase: string): boolean {
        if (!this.meta.encrypted) return true;
        if (!checkVerifier(this.meta.verifier!, passphrase)) return false;
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

    static resetAll(name: string, cwd: string): void {
        const dataPath = path.join(cwd, `${name}.json`);
        const metaPath = path.join(cwd, `${name}.meta.json`);
        for (const p of [dataPath, metaPath]) {
            try {
                fs.unlinkSync(p);
            } catch {
                /* noop */
            }
        }
    }

    get(key: string, defaultValue?: any): any {
        return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : defaultValue;
    }

    set(key: string, value: any): void {
        this.data[key] = value;
        this._persist();
    }
}