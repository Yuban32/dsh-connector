import * as http from 'node:http';
/**
 * Loopback-only management surface. It stands in for the harness UI in v1 and
 * never binds beyond 127.0.0.1; anything on the machine's other interfaces is
 * unreachable here.
 */
export class ConsoleServer {
    options;
    server;
    constructor(options) {
        this.options = options;
    }
    get port() {
        const address = this.server?.address();
        return typeof address === 'object' && address !== null ? address.port : this.options.port;
    }
    async start() {
        if (this.server)
            return true;
        const server = http.createServer((req, res) => void this.dispatch(req, res));
        this.server = server;
        const ok = await new Promise((resolve) => {
            const onError = () => {
                server.removeListener('listening', onListening);
                this.options.log.error(`console port ${this.options.port} unavailable; management surface disabled`);
                this.server = undefined;
                resolve(false);
            };
            const onListening = () => {
                server.removeListener('error', onError);
                this.options.log.info(`console listening on 127.0.0.1:${this.port}`);
                resolve(true);
            };
            server.once('error', onError);
            server.once('listening', onListening);
            server.listen(this.options.port, '127.0.0.1');
        });
        return ok;
    }
    async close() {
        const server = this.server;
        this.server = undefined;
        if (!server)
            return;
        await new Promise((resolve) => {
            server.close(() => resolve());
            server.closeAllConnections?.();
            setTimeout(resolve, 300).unref();
        });
    }
    async dispatch(req, res) {
        const url = (req.url ?? '/').split('?')[0];
        // The harness web UI (different origin) reads this loopback surface; the
        // server only ever binds 127.0.0.1, so permissive CORS is safe here.
        res.setHeader('access-control-allow-origin', '*');
        res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
        res.setHeader('access-control-allow-headers', 'content-type');
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        try {
            if (req.method === 'GET' && (url === '/state' || url === '/health')) {
                return this.json(res, 200, this.options.state());
            }
            if (req.method === 'POST' && url === '/offer') {
                return this.json(res, 200, this.options.openOffer());
            }
            if (req.method === 'POST' && url === '/confirm') {
                const body = await readBody(req);
                const offerId = readString(body, 'offerId');
                if (!offerId)
                    return this.json(res, 400, { error: 'offerId required' });
                return this.json(res, 200, this.options.confirm(offerId));
            }
            if (req.method === 'POST' && url === '/suspend') {
                const body = await readBody(req);
                const deviceId = readString(body, 'deviceId');
                if (!deviceId)
                    return this.json(res, 400, { error: 'deviceId required' });
                return this.json(res, 200, this.options.suspend(deviceId));
            }
            this.json(res, 404, { error: 'not-found' });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'unknown failure';
            this.json(res, 400, { error: message });
        }
    }
    json(res, status, payload) {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload, null, 2));
    }
}
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}
function readString(body, key) {
    try {
        const parsed = JSON.parse(body.toString('utf8'));
        const value = parsed[key];
        return typeof value === 'string' && value !== '' ? value : undefined;
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=console.js.map