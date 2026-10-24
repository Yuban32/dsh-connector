import * as http from 'node:http';
import * as os from 'node:os';
import * as tls from 'node:tls';
import { PSK_CIPHERS } from './ciphers.js';
const MAX_BODY_BYTES = 64 * 1024;
/** Route shape: `/rpc/<identity>` where identity is an offerId or deviceId. */
export function extractIdentity(path) {
    const match = /^\/rpc\/([A-Za-z0-9_-]+)(\/health)?$/.exec(path.split('?')[0] ?? '');
    return match?.[1];
}
/**
 * LAN channel: HTTP over a certificate-less TLS 1.2 PSK connection.
 *
 * Every socket must complete a PSK handshake before any HTTP byte flows, so
 * possession of the offer code (or a device token) gates the entire endpoint —
 * there is no unauthenticated surface on this port. One 0.0.0.0 listener serves
 * all interfaces; `advertise()` enumerates usable addresses.
 */
export class DirectChannel {
    kind = 'direct';
    status = 'stopped';
    lastError;
    port;
    pskForIdentity;
    log;
    tlsServer;
    httpServer;
    sockets = new Set();
    handler;
    constructor(options) {
        this.port = options.port;
        this.pskForIdentity = options.pskForIdentity;
        this.log = options.log ?? (() => { });
    }
    advertise() {
        const hosts = [];
        for (const list of Object.values(os.networkInterfaces())) {
            for (const entry of list ?? []) {
                if (entry.family === 'IPv4' && !entry.internal)
                    hosts.push(entry.address);
            }
        }
        hosts.push('127.0.0.1');
        return hosts.map((host) => ({ host, port: this.actualPort() }));
    }
    actualPort() {
        const address = this.tlsServer?.address();
        return typeof address === 'object' && address !== null ? address.port : this.port;
    }
    async serve(handler) {
        if (this.tlsServer)
            return;
        this.status = 'starting';
        this.handler = handler;
        const httpServer = http.createServer((req, res) => void this.dispatch(req, res));
        this.httpServer = httpServer;
        const tlsServer = tls.createServer({
            pskCallback: (_socket, identity) => {
                try {
                    return this.pskForIdentity(identity) ?? null;
                }
                catch (error) {
                    this.log('warn', `psk lookup failed: ${error instanceof Error ? error.message : 'unknown'}`);
                    return null;
                }
            },
            ciphers: PSK_CIPHERS,
            honorCipherOrder: true,
            minVersion: 'TLSv1.2',
            maxVersion: 'TLSv1.2',
        }, (socket) => {
            this.sockets.add(socket);
            socket.on('close', () => this.sockets.delete(socket));
            socket.on('error', (error) => this.log('debug', `socket error: ${error.message}`));
            // Hand the raw TLS socket to the HTTP server as a plain connection.
            httpServer.emit('connection', socket);
        });
        this.tlsServer = tlsServer;
        await new Promise((resolve) => {
            const onError = (error) => {
                tlsServer.removeListener('listening', onListening);
                if (error.code === 'EADDRINUSE') {
                    this.status = 'busy';
                    this.lastError = 'port already in use';
                }
                else {
                    this.status = 'error';
                    this.lastError = error.message;
                }
                this.log('error', `direct channel start failed: ${error.message}`);
                resolve();
            };
            const onListening = () => {
                tlsServer.removeListener('error', onError);
                this.status = 'ready';
                this.lastError = undefined;
                this.log('info', `direct channel listening on port ${this.actualPort()}`);
                resolve();
            };
            tlsServer.once('error', onError);
            tlsServer.once('listening', onListening);
            tlsServer.listen(this.port, '0.0.0.0');
        });
    }
    async close() {
        const tlsServer = this.tlsServer;
        this.tlsServer = undefined;
        this.handler = undefined;
        this.status = 'stopped';
        for (const socket of this.sockets)
            socket.destroy();
        this.sockets.clear();
        if (!tlsServer)
            return;
        await new Promise((resolve) => {
            tlsServer.close(() => resolve());
            tlsServer.closeAllConnections?.();
            // The HTTP server never listened on its own; just release its resources.
            try {
                this.httpServer?.closeAllConnections?.();
                this.httpServer?.close(() => resolve());
            }
            catch {
                resolve();
            }
            this.httpServer = undefined;
            // Fallback resolve in case neither callback fires.
            setTimeout(resolve, 500).unref();
        });
    }
    async dispatch(req, res) {
        try {
            if (!this.handler) {
                res.writeHead(503).end();
                return;
            }
            const identity = extractIdentity(req.url ?? '/');
            if (!identity) {
                res.writeHead(404, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ error: 'not-found' }));
                return;
            }
            const body = await readBody(req, MAX_BODY_BYTES);
            const response = await this.handler({ identity, path: req.url ?? '/', body });
            res.writeHead(response.status, {
                'content-type': 'application/json',
                'content-length': response.body.length,
            });
            res.end(response.body);
        }
        catch (error) {
            this.log('warn', `request failed: ${error instanceof Error ? error.message : 'unknown'}`);
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'bad-request' }));
        }
    }
}
function readBody(req, limit) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > limit) {
                reject(new Error('body too large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}
//# sourceMappingURL=lan.js.map