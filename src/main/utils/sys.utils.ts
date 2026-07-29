import {exec} from 'node:child_process';
import si from 'systeminformation';

export class SystemUtils {

    static async getPlatformDetails() {
        return await si.osInfo();
    }

    /**
     * This method only provides simple information, for more use {@link getPlatformDetails}
     */
    static getPlatform(): string | undefined {
        const platform = process.platform;
        if (platform === 'win32') return 'win';
        if (platform === 'darwin') return 'osx';
        if (platform === 'linux') return 'linux';
        return undefined;
    }

    /**
     * This method only provides simple information, for more use {@link getPlatformDetails}
     */
    static getArchitecture(): string | undefined {
        const architecture = process.arch;
        if (architecture === 'x64') return 'x64';
        if (architecture === 'arm64') return 'arm64';
        return undefined;
    }

    static execPromise(command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    reject(stderr);
                } else {
                    resolve(stdout);
                }
            });
        });
    }
}