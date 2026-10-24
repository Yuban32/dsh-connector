/**
 * Typed surface for a future harness-UI integration. v1 exposes state polling
 * only; enrollment actions stay on the loopback console until the client-side
 * contract is verified.
 */
export interface ConsoleStateSummary {
    plugin: string;
    version: string;
    hostFp: string;
    direct: {
        status: string;
        port: number;
        hosts: string[];
    };
    devices: Array<{
        deviceId: string;
        name: string;
        state: string;
        enrolledAt: string;
        lastSeenAt?: string;
    }>;
    lastError?: string;
}
export interface DsConnectorRemote {
    getState(): Promise<ConsoleStateSummary>;
}
export declare const REMOTE_SHAPE_VERSION = 1;
//# sourceMappingURL=remote.d.ts.map