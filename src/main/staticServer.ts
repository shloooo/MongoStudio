import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ico': 'image/x-icon'
};

export interface StaticServerHandle {
    url: string;
    server: http.Server;
}

export function startStaticServer(rootDir: string): Promise<StaticServerHandle> {
    return new Promise((resolve, reject) => {
        const resolvedRoot = path.resolve(rootDir);

        const server = http.createServer((req, res) => {
            let reqPath = decodeURIComponent((req.url || '/').split('?')[0]);
            if (reqPath === '/') reqPath = '/index.html';

            const resolvedPath = path.resolve(resolvedRoot, '.' + reqPath);
            const relative = path.relative(resolvedRoot, resolvedPath);
            const escapesRoot = relative.startsWith('..') || path.isAbsolute(relative);

            if (escapesRoot) {
                res.writeHead(403);
                res.end('Forbidden');
                return;
            }

            fs.readFile(resolvedPath, (err, data) => {
                if (err) {
                    res.writeHead(404);
                    res.end('Not found');
                    return;
                }
                const ext = path.extname(resolvedPath);
                res.writeHead(200, {'Content-Type': MIME_TYPES[ext] || 'application/octet-stream'});
                res.end(data);
            });
        });

        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const {port} = server.address() as { port: number };
            resolve({url: `http://127.0.0.1:${port}`, server});
        });
    });
}