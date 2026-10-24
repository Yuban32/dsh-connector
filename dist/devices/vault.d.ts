export type DeviceState = 'awaiting' | 'enrolled' | 'suspended';
export interface DeviceRecord {
    deviceId: string;
    name: string;
    /** Fingerprint of the device's Ed25519 public key, when provided. */
    keyFp?: string;
    /** Long-term channel secret; the basis of the device's reconnect PSK. */
    token: string;
    state: DeviceState;
    offerId: string;
    enrolledAt: string;
    lastSeenAt?: string;
}
export interface VaultFile {
    schemaVersion: 1;
    hostFp: string;
    createdAt: string;
    updatedAt: string;
    devices: DeviceRecord[];
}
export declare function newDeviceId(): string;
export declare function newDeviceToken(): string;
/**
 * Single-file device registry. All lifecycle transitions (awaiting → enrolled
 * → suspended) go through {@link DeviceVault} methods so the file on disk is
 * always a consistent snapshot.
 */
export declare class DeviceVault {
    private data;
    private readonly file;
    private constructor();
    static load(dir: string, hostFp: string): DeviceVault;
    get hostFp(): string;
    list(state?: DeviceState): DeviceRecord[];
    get(deviceId: string): DeviceRecord | undefined;
    put(record: DeviceRecord): void;
    markSeen(deviceId: string): void;
    private flush;
}
//# sourceMappingURL=vault.d.ts.map