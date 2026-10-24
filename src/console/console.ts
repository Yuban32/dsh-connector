import * as http from 'node:http';

import type { DscLogger } from '../context.js';

export interface ConsoleState {
  plugin: string;
  version: string;
  hostFp: string;
  direct: { status: string; mode: string; port: number; hosts: string[] };
  devices: Array<{ deviceId: string; name: string; state: string; enrolledAt: string; lastSeenAt?: string }>;
  lastError?: string;
}

export interface ConsoleOptions {
  port: number;
  log: DscLogger;
  state: () => ConsoleState;
  openOffer: () => { offerId: string; code: string; expiresAt: number; uris: string[] };
  confirm: (offerId: string) => { deviceId: string; name: string };
  suspend: (deviceId: string) => { deviceId: string; state: string };
  /** Forensics sink: the client UI forwards renderer slot-entry crashes here. */
  onClientError?: (info: { slotKey?: string; message: string; stack?: string }) => void;
}

/**
 * Loopback-only management surface. It stands in for the harness UI in v1 and
 * never binds beyond 127.0.0.1; anything on the machine's other interfaces is
 * unreachable here.
 */
export class ConsoleServer {
  private server: http.Server | undefined;

  constructor(private readonly options: ConsoleOptions) {}

  get port(): number {
    const address = this.server?.address();
    return typeof address === 'object' && address !== null ? address.port : this.options.port;
  }

  async start(): Promise<boolean> {
    if (this.server) return true;
    const server = http.createServer((req, res) => void this.dispatch(req, res));
    this.server = server;
    const ok = await new Promise<boolean>((resolve) => {
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

  async close(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (!server) return;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections?.();
      setTimeout(resolve, 300).unref();
    });
  }

  private async dispatch(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
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
        if (!offerId) return this.json(res, 400, { error: 'offerId required' });
        return this.json(res, 200, this.options.confirm(offerId));
      }
      if (req.method === 'POST' && url === '/suspend') {
        const body = await readBody(req);
        const deviceId = readString(body, 'deviceId');
        if (!deviceId) return this.json(res, 400, { error: 'deviceId required' });
        return this.json(res, 200, this.options.suspend(deviceId));
      }
      if (req.method === 'POST' && url === '/client-error') {
        const body = await readBody(req);
        const info = readJsonObject(body, ['slotKey', 'message', 'stack']);
        const message = info.message;
        if (!message) return this.json(res, 400, { error: 'message required' });
        this.options.onClientError?.({ slotKey: info.slotKey, stack: info.stack, message });
        return this.json(res, 200, { ok: true });
      }
      this.json(res, 404, { error: 'not-found' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown failure';
      this.json(res, 400, { error: message });
    }
  }

  private json(res: http.ServerResponse, status: number, payload: unknown): void {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload, null, 2));
  }
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function readString(body: Buffer, key: string): string | undefined {
  try {
    const parsed = JSON.parse(body.toString('utf8')) as Record<string, unknown>;
    const value = parsed[key];
    return typeof value === 'string' && value !== '' ? value : undefined;
  } catch {
    return undefined;
  }
}

function readJsonObject(body: Buffer, keys: readonly string[]): Record<string, string | undefined> {
  try {
    const parsed = JSON.parse(body.toString('utf8')) as Record<string, unknown>;
    const out: Record<string, string | undefined> = {};
    for (const key of keys) {
      const value = parsed[key];
      if (typeof value === 'string' && value !== '') out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}
