import type { DscLogger } from '../context.js';
export interface ConsoleState {
    plugin: string;
    version: string;
    hostFp: string;
    direct: {
        status: string;
        mode: string;
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
export interface ConsoleOptions {
    port: number;
    log: DscLogger;
    state: () => ConsoleState;
    openOffer: () => {
        offerId: string;
        code: string;
        expiresAt: number;
        uris: string[];
    };
    confirm: (offerId: string) => {
        deviceId: string;
        name: string;
    };
    suspend: (deviceId: string) => {
        deviceId: string;
        state: string;
    };
}
/**
 * Loopback-only management surface. It stands in for the harness UI in v1 and
 * never binds beyond 127.0.0.1; anything on the machine's other interfaces is
 * unreachable here.
 */
export declare class ConsoleServer {
    private readonly options;
    private server;
    constructor(options: ConsoleOptions);
    get port(): number;
    start(): Promise<boolean>;
    close(): Promise<void>;
    private dispatch;
    private json;
}
//# sourceMappingURL=console.d.ts.map