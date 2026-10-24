import type { ChannelAdapter, ChannelRequest, ChannelResponse, ChannelStatus } from '../types.js';
/**
 * Placeholder for the future relayed channel (server-assisted reachability).
 * The intended contract is documented in docs/relayed-channel.md; serving
 * intentionally fails until that design is implemented.
 */
export declare class RelayedChannel implements ChannelAdapter {
    readonly kind: "relayed";
    status: ChannelStatus;
    lastError: string | undefined;
    advertise(): Array<{
        host: string;
        port: number;
    }>;
    serve(_handler: (req: ChannelRequest) => Promise<ChannelResponse>): Promise<void>;
    close(): Promise<void>;
}
//# sourceMappingURL=stub.d.ts.map