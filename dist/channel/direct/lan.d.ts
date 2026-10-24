import type { ChannelRequest, ChannelResponse, ChannelStatus } from '../types.js';
export type ChannelMode = 'psk' | 'psk-broad' | 'cert';
export interface DirectChannelOptions {
    port: number;
    /** PSK lookup by client TLS identity; an undefined result fails the handshake. */
    pskForIdentity: (identity: string) => Buffer | undefined;
    /** Certificate for the fallback mode; loaded once, lazily, only if needed. */
    loadTlsCert?: () => Promise<{
        certPem: string;
        keyPem: string;
    }>;
    log?: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void;
    /** Fired for rejected client handshakes (rate-limited) — evidence of probes. */
    onClientRejected?: (reason: string) => void;
    /** Override the mode ladder (tests). Default: psk → psk-broad → cert. */
    preferredModes?: ChannelMode[];
    /** Modes to skip entirely (tests, or policy-driven PSK disablement). */
    disabledModes?: ChannelMode[];
}
/** Route shape: `/rpc/<identity>` where identity is an offerId or deviceId. */
export declare function extractIdentity(path: string): string | undefined;
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
export declare class DirectChannel {
    readonly kind: "direct";
    status: ChannelStatus;
    lastError: string | undefined;
    /** The mode that actually won the ladder ('' until serve() succeeds). */
    mode: ChannelMode | '';
    private readonly port;
    private readonly pskForIdentity;
    private readonly loadTlsCert;
    private readonly log;
    private readonly onClientRejected;
    private readonly preferredModes;
    private readonly disabledModes;
    private readonly sockets;
    private handler;
    private tlsServer;
    private httpServer;
    private rejectedSince;
    private rejectedCount;
    constructor(options: DirectChannelOptions);
    advertise(): Array<{
        host: string;
        port: number;
    }>;
    actualPort(): number;
    serve(handler: (req: ChannelRequest) => Promise<ChannelResponse>): Promise<void>;
    private tlsOptionsFor;
    private listenWith;
    /** Report rejected handshakes at most once per minute, with a count. */
    private rejectSeen;
    close(): Promise<void>;
    private dispatch;
}
//# sourceMappingURL=lan.d.ts.map