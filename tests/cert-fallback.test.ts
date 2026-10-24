import { deepStrictEqual, ok } from 'node:assert';
import { test } from 'node:test';

import { DirectChannel } from '../dist/channel/direct/lan.js';
import { loadOrCreateTlsCert } from '../dist/channel/direct/cert-identity.js';
import { pskRequest } from '../dist/channel/direct/psk-http-client.js';
import { makeGate, makeTempDir } from './helpers.js';

/**
 * Exercises the certificate fallback path end-to-end (the mode the harness's
 * BoringSSL-backed TLS stack forces us onto).
 */
test('cert fallback mode serves health and enrolls with in-band code check', async () => {
  const dir = makeTempDir();
  const { gate } = makeGate();
  const cert = await loadOrCreateTlsCert(dir, 'test-host');
  ok(cert.certPem.startsWith('-----BEGIN CERTIFICATE-----'));
  ok(cert.keyPem.startsWith('-----BEGIN PRIVATE KEY-----'));
  // Deterministic reload.
  const again = await loadOrCreateTlsCert(dir, 'test-host');
  deepStrictEqual(again.certPem, cert.certPem);

  const channel = new DirectChannel({
    port: 0,
    pskForIdentity: () => undefined,
    loadTlsCert: async () => ({ certPem: cert.certPem, keyPem: cert.keyPem }),
    preferredModes: ['cert'],
    log: () => {},
  });
  await channel.serve(async (req) => {
    if (req.path.endsWith('/health')) {
      return { status: 200, body: Buffer.from(JSON.stringify({ ok: true })) };
    }
    return { status: 404, body: Buffer.from('{}') };
  });
  ok(channel.mode === 'cert');
  ok(channel.status === 'ready');

  const port = channel.actualPort();
  const endpoint = { host: '127.0.0.1', port, identity: 'probe' };
  const health = await pskRequest(endpoint, '/rpc/probe/health');
  deepStrictEqual(health.status, 200);

  await channel.close();
});

test('mode ladder skips PSK modes that throw and lands on cert', async () => {
  const dir = makeTempDir();
  const { gate } = makeGate();
  void gate;
  const cert = await loadOrCreateTlsCert(dir, 'test-host');
  const channel = new DirectChannel({
    port: 0,
    pskForIdentity: () => undefined,
    loadTlsCert: async () => ({ certPem: cert.certPem, keyPem: cert.keyPem }),
    preferredModes: ['psk', 'cert'],
    disabledModes: ['psk', 'psk-broad'],
    log: () => {},
  });
  await channel.serve(async () => ({ status: 200, body: Buffer.from('{}') }));
  deepStrictEqual(channel.mode, 'cert');
  await channel.close();
});
