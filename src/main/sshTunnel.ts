import {Client} from 'ssh2';
import net from 'node:net';
import fs from 'node:fs';

export interface SshConfig {
    host: string;
    port?: number;
    username: string;
    authType: 'key' | 'password';
    privateKeyPath?: string;
    passphrase?: string;
    password?: string;
}

export interface SshTunnel {
    localPort: number;
    sshClient: Client;
    server: net.Server;
}

/**
 * Opens an SSH tunnel: connects to sshConfig's host, then forwards
 * a local ephemeral port to (mongoHost, mongoPort) on the remote side.
 * Resolves with { localPort, sshClient, server } — caller must close both
 * sshClient and server when the tunnel is no longer needed.
 */
export function openTunnel(sshConfig: SshConfig, mongoHost: string, mongoPort: number): Promise<SshTunnel> {
    return new Promise((resolve, reject) => {
        const conn = new Client();

        conn.on('ready', () => {
            const server = net.createServer((localSocket) => {
                conn.forwardOut(
                    localSocket.remoteAddress || '127.0.0.1',
                    localSocket.remotePort || 0,
                    mongoHost,
                    mongoPort,
                    (err, stream) => {
                        if (err) {
                            localSocket.destroy();
                            return;
                        }
                        localSocket.pipe(stream).pipe(localSocket);
                    }
                );
            });

            server.listen(0, '127.0.0.1', () => {
                const localPort = (server.address() as net.AddressInfo).port;
                resolve({localPort, sshClient: conn, server});
            });

            server.on('error', (err) => reject(err));
        });

        conn.on('error', (err) => reject(err));

        const connectOptions: Record<string, any> = {
            host: sshConfig.host,
            port: sshConfig.port || 22,
            username: sshConfig.username,
            readyTimeout: 10000
        };

        if (sshConfig.authType === 'key') {
            try {
                connectOptions.privateKey = fs.readFileSync(sshConfig.privateKeyPath!, 'utf-8');
                if (sshConfig.passphrase) connectOptions.passphrase = sshConfig.passphrase;
            } catch (err: any) {
                return reject(new Error(`SSH-Key konnte nicht gelesen werden: ${err.message}`));
            }
        } else {
            connectOptions.password = sshConfig.password;
        }

        conn.connect(connectOptions);
    });
}

export function closeTunnel(tunnel: SshTunnel | null | undefined): void {
    if (!tunnel) return;
    try {
        tunnel.server.close();
    } catch {
        /* noop */
    }
    try {
        tunnel.sshClient.end();
    } catch {
        /* noop */
    }
}