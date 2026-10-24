import * as http from 'node:http';
import * as os from 'node:os';
import * as tls from 'node:tls';

import type { ChannelRequest, ChannelResponse, ChannelStatus } from '../types.js';
import { PSK_CIPHERS, PSK_CIPHERS_BROAD } from './ciphers.js';

export type ChannelMode = 'psk' | 'psk-broad' | 'cert';

export interface DirectChannelOptions {
  port: number;
  /** PSK lookup by client TLS identity; an undefined result fails the handshake. */
  pskForIdentity: (identity: string) => Buffer | undefined;
  /** Certificate for the fallback mode; loaded once, lazily, only if needed. */
  loadTlsCert?: () => Promise<{ certPem: string; keyPem: string }>;
  log?: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void;
  /** Fired for rejected client handshakes (rate-limited) — evidence of probes. */
  onClientRejected?: (reason: string) => void;
  /** Override the mode ladder (tests). Default: psk → psk-broad → cert. */
  preferredModes?: ChannelMode[];
  /** Modes to skip entirely (tests, or policy-driven PSK disablement). */
  disabledModes?: ChannelMode[];
}

const MAX_BODY_BYTES = 64 * 1024;

/** Route shape: `/rpc/<identity>` where identity is an offerId or deviceId. */
export function extractIdentity(path: string): string | undefined {
  const match = /^\/rpc\/([A-Za-z0-9_-]+)(\/health)?$/.exec(path.split('?')[0] ?? '');
  return match?.[1];
}

/**
 * LAN channel with a TLS mode ladder.
 *
 * - `psk`/`psk-broad`: certificate-less TLS 1.2 pre-shared keys — the entire
 *   port has no unauthenticated surface; possession of the offer code (or a
 *   device token) gates everything.
 * - `cert` fallback: some runtimes (Electron's BoringSSL-backed node:tls)
 *   reject PSK suites at cipher-list parse time, so when every PSK mode fails
 *   to construct, this mode serves a normal self-signed certificate and the
 *   enrollment code moves to an in-band check (gate.verifyOfferCode).
 *
 * The ladder runs at serve() time: the first mode whose server constructs and
 * listens wins. EADDRINUSE short-circuits to `busy` (port conflict, not mode).
 */
export class DirectChannel {
  readonly kind = 'direct' as const;
  status: ChannelStatus = 'stopped';
  lastError: string | undefined;
  /** The mode that actually won the ladder ('' until serve() succeeds). */
  mode: ChannelMode | '' = '';

  private readonly port: number;
  private readonly pskForIdentity: DirectChannelOptions['pskForIdentity'];
  private readonly loadTlsCert: DirectChannelOptions['loadTlsCert'];
  private readonly log: NonNullable<DirectChannelOptions['log']>;
  private readonly onClientRejected: DirectChannelOptions['onClientRejected'];
  private readonly preferredModes: ChannelMode[];
  private readonly disabledModes: ChannelMode[];
  private readonly sockets = new Set<tls.TLSSocket>();
  private handler: ((req: ChannelRequest) => Promise<ChannelResponse>) | undefined;
  private tlsServer: tls.Server | undefined;
  private httpServer: http.Server | undefined;
  private rejectedSince = 0;
  private rejectedCount = 0;

  constructor(options: DirectChannelOptions) {
    this.port = options.port;
    this.pskForIdentity = options.pskForIdentity;
    this.loadTlsCert = options.loadTlsCert;
    this.log = options.log ?? (() => {});
    this.onClientRejected = options.onClientRejected;
    this.preferredModes = options.preferredModes ?? ['psk', 'psk-broad', 'cert'];
    this.disabledModes = options.disabledModes ?? [];
  }

  advertise(): Array<{ host: string; port: number }> {
    const hosts: string[] = [];
    for (const list of Object.values(os.networkInterfaces())) {
      for (const entry of list ?? []) {
        if (entry === null) continue;
        if (entry.family === 'IPv4' && !entry.internal) hosts.push(entry.address);
      }
    }
    hosts.push('127.0.0.1');
    return hosts.map((host) => ({ host, port: this.actualPort() }));
  }

  actualPort(): number {
    const address = this.tlsServer?.address();
    return typeof address === 'object' && address !== null ? address.port : this.port;
  }

  async serve(handler: (req: ChannelRequest) => Promise<ChannelResponse>): Promise<void> {
    if (this.tlsServer) return;
    this.status = 'starting';
    this.handler = handler;

    const httpServer = http.createServer((req, res) => void this.dispatch(req, res));
    this.httpServer = httpServer;

    const attempted: ChannelMode[] = [];
    for (const mode of this.preferredModes) {
      const tlsOptions = await this.tlsOptionsFor(mode);
      if (!tlsOptions) continue;
      attempted.push(mode);
      const outcome = await this.listenWith(mode, tlsOptions, httpServer);
      if (outcome === 'listening') {
        this.status = 'ready';
        this.mode = mode;
        this.lastError = undefined;
        this.log('info', `direct channel listening on port ${this.actualPort()} (mode: ${mode})`);
        return;
      }
      if (outcome === 'busy') {
        this.status = 'busy';
        this.lastError = 'port already in use';
        this.log('error', `direct channel start failed: ${this.lastError}`);
        return;
      }
      // 'mode-failed' — fall through to the next mode in the ladder.
    }
    this.status = 'error';
    this.lastError = `no TLS mode succeeded (tried: ${attempted.join(', ') || 'none'})`;
    this.log('error', `direct channel start failed: ${this.lastError}`);
  }

  private async tlsOptionsFor(mode: ChannelMode): Promise<tls.TlsOptions | undefined> {
    if (this.disabledModes.includes(mode)) return undefined;
    if (mode === 'cert') {
      if (!this.loadTlsCert) return undefined;
      try {
        const { certPem, keyPem } = await this.loadTlsCert();
        return { cert: certPem, key: keyPem, honorCipherOrder: true };
        // Default ECDHE cipher list; normal certificate handshake.
      } catch (error) {
        this.log('warn', `tls cert load failed: ${error instanceof Error ? error.message : 'unknown'}`);
        return undefined;
      }
    }
    const ciphers = mode === 'psk' ? PSK_CIPHERS : PSK_CIPHERS_BROAD;
    return {
      pskCallback: (socket, identity) => {
        try {
          return this.pskForIdentity(identity) ?? null;
        } catch (error) {
          this.log('warn', `psk lookup failed: ${error instanceof Error ? error.message : 'unknown'}`);
          return null;
        }
      },
      ciphers,
      honorCipherOrder: true,
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.2',
    };
  }

  private listenWith(
    mode: ChannelMode,
    tlsOptions: tls.TlsOptions,
    httpServer: http.Server,
  ): Promise<'listening' | 'busy' | 'mode-failed'> {
    return new Promise((resolve) => {
      let tlsServer: tls.Server;
      try {
        tlsServer = new tls.Server(tlsOptions, (socket) => {
          this.sockets.add(socket);
          socket.on('close', () => this.sockets.delete(socket));
          socket.on('error', (error) => {
            this.rejectSeen(error.message);
            this.log('debug', `client handshake rejected: ${error.message}`);
          });
          // Hand the raw TLS socket to the HTTP server as a plain connection.
          httpServer.emit('connection', socket);
        });
      } catch (error) {
        // Cipher-list parse failure (e.g. BoringSSL without PSK suites).
        this.log('warn', `mode ${mode} rejected: ${error instanceof Error ? error.message : 'unknown'}`);
        resolve('mode-failed');
        return;
      }
      this.tlsServer = tlsServer;
      const onError = (error: Error) => {
        tlsServer.removeListener('listening', onListening);
        if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
          resolve('busy');
        } else {
          resolve('mode-failed');
        }
      };
      const onListening = () => {
        tlsServer.removeListener('error', onError);
        resolve('listening');
      };
      tlsServer.once('error', onError);
      tlsServer.once('listening', onListening);
      tlsServer.listen(this.port, '0.0.0.0');
    });
  }

  /** Report rejected handshakes at most once per minute, with a count. */
  private rejectSeen(reason: string): void {
    const now = Date.now();
    this.rejectedCount += 1;
    if (now - this.rejectedSince < 60_000) return;
    this.rejectedSince = now;
    this.onClientRejected?.(`${this.rejectedCount}x, last: ${reason}`);
    this.rejectedCount = 0;
  }

  async close(): Promise<void> {
    const tlsServer = this.tlsServer;
    this.tlsServer = undefined;
    this.handler = undefined;
    this.status = 'stopped';
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    if (!tlsServer) return;
    await new Promise<void>((resolve) => {
      tlsServer.close(() => resolve());
      (tlsServer as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
      try {
        this.httpServer?.closeAllConnections?.();
        this.httpServer?.close(() => resolve());
      } catch {
        resolve();
      }
      this.httpServer = undefined;
      setTimeout(resolve, 500).unref();
    });
  }

  private async dispatch(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
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
    } catch (error) {
      this.log('warn', `request failed: ${error instanceof Error ? error.message : 'unknown'}`);
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad-request' }));
    }
  }
}

function readBody(req: http.IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
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
