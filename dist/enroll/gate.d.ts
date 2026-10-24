import { DeviceRecord, DeviceVault } from '../devices/vault.js';
export type GatePhase = 'open' | 'claimed' | 'enrolled' | 'closed';
export interface GateOffer {
    offerId: string;
    code: string;
    expiresAt: number;
    phase: GatePhase;
    deviceId?: string;
}
export interface OpenedOffer extends GateOffer {
    phase: 'open';
}
export interface ClaimResult {
    status: 'wait-confirm';
    hostFp: string;
}
export type PollResult = {
    status: 'wait-confirm';
} | {
    status: 'enrolled';
    deviceId: string;
    token: string;
} | {
    status: 'expired';
};
export interface GateEvents {
    onEvent?: (kind: string, detail?: Record<string, unknown>) => void;
}
/**
 * Enrollment state machine.
 *
 * offer: open → claimed → (enrolled | closed | expired)
 * device: awaiting → enrolled → suspended
 *
 * The TLS layer proves possession of the offer code before any RPC reaches the
 * gate; claim() additionally re-checks the offer id carried in the request so
 * a connection cannot act on a different offer than the one it authenticated
 * against.
 */
export declare class Gate {
    private readonly vault;
    private readonly hostFp;
    private readonly offers;
    private readonly ttlMs;
    private readonly now;
    private readonly emit;
    constructor(vault: DeviceVault, hostFp: string, options: {
        offerTtlMs: number;
        now?: () => number;
        events?: GateEvents;
    });
    openOffer(): OpenedOffer;
    claim(offerId: string, deviceName: string, keyFp?: string): ClaimResult;
    poll(offerId: string): PollResult;
    confirm(offerId: string): DeviceRecord;
    suspend(deviceId: string): DeviceRecord;
    /** PSK lookup used by the channel's TLS layer, keyed by client identity. */
    pskForIdentity(identity: string): Buffer | undefined;
    /** True when the identity is a live offer id usable as a channel identity. */
    isOfferIdentity(identity: string): boolean;
    /**
     * In-band code check for fallback channels whose TLS layer cannot carry the
     * code (certificate mode): the claim must present the offer code itself.
     */
    verifyOfferCode(offerId: string, code: unknown): boolean;
    private liveOffer;
}
export declare class GateError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
//# sourceMappingURL=gate.d.ts.map