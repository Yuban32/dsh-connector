import type { ChannelRequest, ChannelResponse, ChannelStatus } from '../types.js';
export interface DirectChannelOptions {
    port: number;
    /** PSK lookup by client TLS identity; an undefined result fails the handshake. */
    pskForIdentity: (identity: string) => Buffer | undefined;
    log?: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void;
    /** Fired for rejected client handshakes (rate-limited) — evidence of probes. */
    onClientRejected?: (reason: string) => void;
}
/** Route shape: `/rpc/<identity>` where identity is an offerId or deviceId. */
export declare function extractIdentity(path: string): string | undefined;
/**
 * LAN channel: HTTP over a certificate-less TLS 1.2 PSK connection.
 *
 * Every socket must complete a PSK handshake before any HTTP byte flows, so
 * possession of the offer code (or a device token) gates the entire endpoint —
 * there is no unauthenticated surface on this port. One 0.0.0.0 listener serves
 * all interfaces; `advertise()` enumerates usable addresses.
 */
export declare class DirectChannel {
    readonly kind: "direct";
    status: ChannelStatus;
    lastError: string | undefined;
    private readonly port;
    private readonly pskForIdentity;
    private readonly log;
    private readonly onClientRejected;
    private rejectedSince;
    private rejectedCount;
    private tlsServer;
    private httpServer;
    private readonly sockets;
    private handler;
    constructor(options: DirectChannelOptions);
    /** Report rejected handshakes at most once per minute, with a count. */
    private rejectSeen;
    advertise(): Array<{
        host: string;
        port: number;
    }>;
    actualPort(): number;
    serve(handler: (req: ChannelRequest) => Promise<ChannelResponse>): Promise<void>;
    close(): Promise<void>;
    private dispatch;
}
//# sourceMappingURL=lan.d.ts.map