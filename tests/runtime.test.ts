import { deepStrictEqual, ok } from 'node:assert';
import { test } from 'node:test';

import { createRuntime, type RuntimeHandles } from '../dist/index.js';
import { resolveConfig } from '../dist/config.js';
import { deriveDevicePsk, deriveOfferPsk } from '../dist/enroll/psk.js';
import { pskRequest } from '../dist/channel/direct/psk-http-client.js';
import { makeTempDir } from './helpers.js';

type UriParts = { host: string; port: number; offerId: string; hostFp: string; code: string };

function parseOfferUri(uri: string): UriParts {
  const parsed = new URL(uri);
  const q = parsed.searchParams;
  return {
    host: decodeURIComponent(q.get('h') ?? ''),
    port: Number(q.get('p')),
    offerId: decodeURIComponent(q.get('o') ?? ''),
    hostFp: decodeURIComponent(q.get('fp') ?? ''),
    code: decodeURIComponent(q.get('c') ?? ''),
  };
}

async function rpc(
  port: number,
  identity: string,
  psk: Buffer,
  method: string,
  params: Record<string, unknown>,
): Promise<any> {
  const body = Buffer.from(JSON.stringify({ v: 1, id: 1, method, params }));
  const response = await pskRequest({ host: '127.0.0.1', port, identity, psk }, `/rpc/${identity}`, body);
  const json = JSON.parse(response.body.toString('utf8')) as { result?: unknown; error?: { code: string } };
  if (json.error) throw new Error(`rpc ${method} failed: ${json.error.code}`);
  return json.result;
}

async function assertHandshakeFails(endpoint: { host: string; port: number; identity: string; psk: Buffer }): Promise<void> {
  try {
    await pskRequest(endpoint, `/rpc/${endpoint.identity}/health`);
  } catch {
    return; // expected: wrong or unknown PSK never completes the handshake
  }
  throw new Error('handshake unexpectedly succeeded');
}

async function withRuntime(fn: (rt: RuntimeHandles, port: number) => Promise<void>): Promise<void> {
  const config = resolveConfig({ port: 0, consolePort: 0, offerTtlMs: 60_000 }, { DSC_DATA_DIR: makeTempDir() });
  const runtime = await createRuntime(config, { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} });
  try {
    await fn(runtime, runtime.direct.actualPort());
  } finally {
    await runtime.close();
  }
}

test('runtime starts ready and stops cleanly', async () => {
  await withRuntime(async (rt) => {
    deepStrictEqual(rt.direct.status, 'ready');
    ok(rt.direct.actualPort() > 0);
    const state = rt.state();
    deepStrictEqual(state.plugin, 'DS Connector');
    deepStrictEqual(state.direct.status, 'ready');
    ok(state.hostFp.startsWith('ed25519:'));
  });
});

test('full enrollment loop over real TLS-PSK', async () => {
  await withRuntime(async (rt, port) => {
    const offer = rt.openOffer();
    ok(offer.uris.length >= 1);
    const parts = parseOfferUri(offer.uris.at(-1) as string);
    deepStrictEqual(parts.offerId, offer.offerId);
    deepStrictEqual(parts.host, '127.0.0.1');

    const offerPsk = deriveOfferPsk(offer.code, offer.offerId, rt.hostFp);

    // A wrong code derives a different PSK → handshake must fail.
    await assertHandshakeFails({
      host: '127.0.0.1',
      port,
      identity: offer.offerId,
      psk: deriveOfferPsk('XXXXXXXX', offer.offerId, rt.hostFp),
    });
    // An unknown identity has no PSK at all → handshake must fail.
    await assertHandshakeFails({
      host: '127.0.0.1',
      port,
      identity: 'off_unknown',
      psk: offerPsk,
    });

    const claim = await rpc(port, offer.offerId, offerPsk, 'enroll.claim', {
      offerId: offer.offerId,
      deviceName: 'runtime-test device',
    });
    deepStrictEqual(claim.status, 'wait-confirm');

    const confirmed = rt.confirm(offer.offerId);
    ok(confirmed.deviceId.startsWith('dev_'));

    const poll = await rpc(port, offer.offerId, offerPsk, 'enroll.poll', { offerId: offer.offerId });
    deepStrictEqual(poll.status, 'enrolled');
    deepStrictEqual(poll.deviceId, confirmed.deviceId);

    const devicePsk = deriveDevicePsk(poll.token, poll.deviceId, rt.hostFp);
    const ping = await rpc(port, poll.deviceId, devicePsk, 'device.ping', {});
    deepStrictEqual(ping.ok, true);

    deepStrictEqual(rt.state().devices.length, 1);
    deepStrictEqual(rt.state().devices[0]?.state, 'enrolled');

    await rpc(port, poll.deviceId, devicePsk, 'device.suspend', {});
    deepStrictEqual(rt.state().devices[0]?.state, 'suspended');
    await assertHandshakeFails({ host: '127.0.0.1', port, identity: poll.deviceId, psk: devicePsk });
  });
});

test('health endpoint answers inside a PSK connection', async () => {
  await withRuntime(async (rt, port) => {
    const offer = rt.openOffer();
    const parts = parseOfferUri(offer.uris.at(-1) as string);
    const response = await pskRequest(
      { host: '127.0.0.1', port, identity: parts.offerId, psk: deriveOfferPsk(offer.code, offer.offerId, rt.hostFp) },
      `/rpc/${parts.offerId}/health`,
    );
    deepStrictEqual(response.status, 200);
    deepStrictEqual(JSON.parse(response.body.toString('utf8')).wire, 1);
  });
});
