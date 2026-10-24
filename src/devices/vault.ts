import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

import { readJsonFile, writeJsonFileAtomic } from '../storage/json-file.js';

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

const VAULT_FILE = 'vault.json';

export function newDeviceId(): string {
  return `dev_${randomBytes(12).toString('base64url')}`;
}

export function newDeviceToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Single-file device registry. All lifecycle transitions (awaiting → enrolled
 * → suspended) go through {@link DeviceVault} methods so the file on disk is
 * always a consistent snapshot.
 */
export class DeviceVault {
  private data: VaultFile;
  private readonly file: string;

  private constructor(file: string, data: VaultFile) {
    this.file = file;
    this.data = data;
  }

  static load(dir: string, hostFp: string): DeviceVault {
    const file = join(dir, VAULT_FILE);
    const existing = readJsonFile<VaultFile>(file);
    if (existing?.schemaVersion === 1 && Array.isArray(existing.devices) && existing.hostFp === hostFp) {
      return new DeviceVault(file, existing);
    }
    // A missing vault — or one from a different host key — starts fresh.
    const fresh: VaultFile = {
      schemaVersion: 1,
      hostFp,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      devices: [],
    };
    writeJsonFileAtomic(file, fresh, 2);
    return new DeviceVault(file, fresh);
  }

  get hostFp(): string {
    return this.data.hostFp;
  }

  list(state?: DeviceState): DeviceRecord[] {
    return this.data.devices.filter((device) => (state ? device.state === state : true));
  }

  get(deviceId: string): DeviceRecord | undefined {
    return this.data.devices.find((device) => device.deviceId === deviceId);
  }

  put(record: DeviceRecord): void {
    const index = this.data.devices.findIndex((device) => device.deviceId === record.deviceId);
    if (index >= 0) this.data.devices[index] = record;
    else this.data.devices.push(record);
    this.flush();
  }

  markSeen(deviceId: string): void {
    const device = this.get(deviceId);
    if (!device) return;
    device.lastSeenAt = new Date().toISOString();
    this.flush();
  }

  private flush(): void {
    this.data.updatedAt = new Date().toISOString();
    writeJsonFileAtomic(this.file, this.data, 2);
  }
}
