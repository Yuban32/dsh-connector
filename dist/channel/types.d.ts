export type ChannelKind = 'direct' | 'relayed';
export type ChannelStatus = 'stopped' | 'starting' | 'ready' | 'busy' | 'error';
/**
 * A channel adapter owns the wire for one reachability mode and funnels all
 * traffic into a single RPC handler. `advertise()` returns endpoint descriptors
 * suitable for the offer URI list (host + transport, never secrets).
 */
export interface ChannelAdapter {
    readonly kind: ChannelKind;
    readonly status: ChannelStatus;
    readonly lastError?: string;
    /** Endpoint params for the offer URI: transport tag + host/port pairs. */
    advertise(): Array<{
        host: string;
        port: number;
    }>;
    serve(handler: (req: ChannelRequest) => Promise<ChannelResponse>): Promise<void>;
    close(): Promise<void>;
}
export interface ChannelRequest {
    identity: string;
    path: string;
    body: Buffer;
}
export interface ChannelResponse {
    status: number;
    body: Buffer;
}
//# sourceMappingURL=types.d.ts.map