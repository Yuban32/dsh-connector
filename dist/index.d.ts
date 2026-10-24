import { DscLogger, DscPluginContext } from './context.js';
import { DscConfig } from './config.js';
import { DeviceVault } from './devices/vault.js';
import { Gate } from './enroll/gate.js';
import { ConsoleServer, ConsoleState } from './console/console.js';
import { Diagnostics } from './diagnostics.js';
import { DirectChannel } from './channel/direct/lan.js';
import type { ChannelRequest, ChannelResponse } from './channel/types.js';
export { PLUGIN_NAME as name, PLUGIN_VERSION, WIRE_VERSION, OFFER_SCHEME } from './metadata.js';
export { resolveConfig, type DscConfig } from './config.js';
export { Gate, GateError } from './enroll/gate.js';
export { DeviceVault } from './devices/vault.js';
export { DirectChannel } from './channel/direct/lan.js';
export { RelayedChannel } from './channel/relayed/stub.js';
export { deriveOfferPsk, deriveDevicePsk } from './enroll/psk.js';
export interface OfferPresentation {
    offerId: string;
    code: string;
    expiresAt: number;
    /** One URI per reachable endpoint; phone-side scans/pastes exactly one. */
    uris: string[];
    /** Screen-renderable QR per endpoint; loopback is dropped when LAN endpoints exist. */
    qr: Array<{
        host: string;
        uri: string;
        svg: string;
    }>;
}
export interface RuntimeHandles {
    config: DscConfig;
    hostFp: string;
    vault: DeviceVault;
    gate: Gate;
    direct: DirectChannel;
    console: ConsoleServer;
    diagnostics: Diagnostics;
    state(): ConsoleState;
    openOffer(): Promise<OfferPresentation>;
    confirm(offerId: string): {
        deviceId: string;
        name: string;
    };
    suspend(deviceId: string): {
        deviceId: string;
        state: string;
    };
    handleChannel(req: ChannelRequest): Promise<ChannelResponse>;
    close(): Promise<void>;
}
/**
 * Wire everything together. Kept separate from `apply` so tests and the smoke
 * script can drive a full runtime with ephemeral ports and a temp directory.
 */
export declare function createRuntime(config: DscConfig, log: DscLogger): Promise<RuntimeHandles>;
/** Cordis entry point. The host calls this once per plugin load. */
export declare function apply(ctx: DscPluginContext, cordisConfig?: Partial<DscConfig>): Promise<void>;
//# sourceMappingURL=index.d.ts.map