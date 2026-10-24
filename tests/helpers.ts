import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after } from 'node:test';

import { loadOrCreateHostKeys } from '../dist/host/host-keys.js';
import { DeviceVault } from '../dist/devices/vault.js';
import { Gate } from '../dist/enroll/gate.js';

const tempDirs: string[] = [];
after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

export function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsc-test-'));
  tempDirs.push(dir);
  return dir;
}

export function makeGate(offerTtlMs = 60_000, now?: () => number) {
  const dir = makeTempDir();
  const host = loadOrCreateHostKeys(dir);
  const vault = DeviceVault.load(dir, host.publicFp);
  const gate = new Gate(vault, host.publicFp, { offerTtlMs, now });
  return { gate, vault, hostFp: host.publicFp, dir };
}
