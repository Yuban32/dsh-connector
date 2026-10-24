import { deepStrictEqual, notDeepStrictEqual, ok } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { generateCode, isValidCode, normalizeCode } from '../dist/enroll/codes.js';
import { deriveDevicePsk, deriveOfferPsk } from '../dist/enroll/psk.js';
import { loadOrCreateHostKeys, publicKeyFp } from '../dist/host/host-keys.js';
import { makeTempDir } from './helpers.js';

test('codes use the unambiguous alphabet only', () => {
  for (let i = 0; i < 50; i += 1) {
    const code = generateCode();
    ok(isValidCode(code), `generated invalid code: ${code}`);
  }
  deepStrictEqual(generateCode(6).length, 6);
});

test('code normalization uppercases and strips separators', () => {
  deepStrictEqual(normalizeCode('ab cd-23'), 'ABCD23');
});

test('offer PSK derivation is deterministic and code-sensitive', () => {
  const a1 = deriveOfferPsk('CODE2345', 'off_1', 'fp:host');
  const a2 = deriveOfferPsk('CODE2345', 'off_1', 'fp:host');
  const b = deriveOfferPsk('XXXXXXXX', 'off_1', 'fp:host');
  deepStrictEqual(a1, a2);
  notDeepStrictEqual(a1, b);
  deepStrictEqual(a1.length, 32);
});

test('device PSK differs per device id and token', () => {
  const a = deriveDevicePsk('tok1', 'dev_1', 'fp:host');
  const b = deriveDevicePsk('tok2', 'dev_1', 'fp:host');
  const c = deriveDevicePsk('tok1', 'dev_2', 'fp:host');
  notDeepStrictEqual(a, b);
  notDeepStrictEqual(a, c);
});

test('psk derivation tolerates empty inputs but still yields 32 bytes', () => {
  // HKDF accepts empty input key material by design (RFC 5869).
  const derived = deriveOfferPsk('', '', '');
  deepStrictEqual(derived.length, 32);
  deepStrictEqual(derived, deriveOfferPsk('', '', ''));
});

test('host key file persists and fingerprint is stable', () => {
  const dir = makeTempDir();
  const first = loadOrCreateHostKeys(dir);
  const second = loadOrCreateHostKeys(dir);
  deepStrictEqual(first.publicFp, second.publicFp);
  deepStrictEqual(first.privateKeyPem, second.privateKeyPem);
  ok(first.publicFp.startsWith('ed25519:'));
  deepStrictEqual(publicKeyFp(first.publicKeyPem), first.publicFp);
  const raw = JSON.parse(readFileSync(join(dir, 'host-key.json'), 'utf8')) as { v: number };
  deepStrictEqual(raw.v, 1);
});
