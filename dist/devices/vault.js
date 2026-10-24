import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { readJsonFile, writeJsonFileAtomic } from '../storage/json-file.js';
const VAULT_FILE = 'vault.json';
export function newDeviceId() {
    return `dev_${randomBytes(12).toString('base64url')}`;
}
export function newDeviceToken() {
    return randomBytes(32).toString('base64url');
}
/**
 * Single-file device registry. All lifecycle transitions (awaiting → enrolled
 * → suspended) go through {@link DeviceVault} methods so the file on disk is
 * always a consistent snapshot.
 */
export class DeviceVault {
    data;
    file;
    constructor(file, data) {
        this.file = file;
        this.data = data;
    }
    static load(dir, hostFp) {
        const file = join(dir, VAULT_FILE);
        const existing = readJsonFile(file);
        if (existing?.schemaVersion === 1 && Array.isArray(existing.devices) && existing.hostFp === hostFp) {
            return new DeviceVault(file, existing);
        }
        // A missing vault — or one from a different host key — starts fresh.
        const fresh = {
            schemaVersion: 1,
            hostFp,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            devices: [],
        };
        writeJsonFileAtomic(file, fresh, 2);
        return new DeviceVault(file, fresh);
    }
    get hostFp() {
        return this.data.hostFp;
    }
    list(state) {
        return this.data.devices.filter((device) => (state ? device.state === state : true));
    }
    get(deviceId) {
        return this.data.devices.find((device) => device.deviceId === deviceId);
    }
    put(record) {
        const index = this.data.devices.findIndex((device) => device.deviceId === record.deviceId);
        if (index >= 0)
            this.data.devices[index] = record;
        else
            this.data.devices.push(record);
        this.flush();
    }
    markSeen(deviceId) {
        const device = this.get(deviceId);
        if (!device)
            return;
        device.lastSeenAt = new Date().toISOString();
        this.flush();
    }
    flush() {
        this.data.updatedAt = new Date().toISOString();
        writeJsonFileAtomic(this.file, this.data, 2);
    }
}
//# sourceMappingURL=vault.js.map