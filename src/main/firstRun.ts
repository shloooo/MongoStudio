import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const REGISTRY_KEY = 'HKCU\\Software\\MongoStudio';
const REGISTRY_VALUE = 'SetupCompleted';

function readWindowsRegistryFlag(): boolean {
    try {
        const output = execFileSync('reg', ['query', REGISTRY_KEY, '/v', REGISTRY_VALUE], {
            stdio: ['ignore', 'pipe', 'ignore']
        }).toString('utf-8');
        return /0x1/.test(output);
    } catch {
        return false;
    }
}

function writeWindowsRegistryFlag(): void {
    try {
        execFileSync('reg', ['add', REGISTRY_KEY, '/v', REGISTRY_VALUE, '/t', 'REG_DWORD', '/d', '1', '/f'], {
            stdio: 'ignore'
        });
    } catch {
        // best-effort only; settings.json remains the source of truth
    }
}

export function shouldShowSetup(settingsPath: string): boolean {
    const settingsExist = fs.existsSync(settingsPath);
    if (settingsExist) return false;

    if (process.platform === 'win32') {
        return !readWindowsRegistryFlag();
    }

    return true;
}

export function markSetupCompleted(): void {
    if (process.platform === 'win32') {
        writeWindowsRegistryFlag();
    }
}