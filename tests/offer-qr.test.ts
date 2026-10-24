import { deepStrictEqual, ok } from 'node:assert';
import { test } from 'node:test';

import { createRuntime, type RuntimeHandles } from '../dist/index.js';
import { resolveConfig } from '../dist/config.js';
import { makeTempDir } from './helpers.js';

async function withRuntime(fn: (rt: RuntimeHandles) => Promise<void>): Promise<void> {
  const config = resolveConfig({ port: 0, consolePort: 0, offerTtlMs: 60_000 }, { DSC_DATA_DIR: makeTempDir() });
  const runtime = await createRuntime(config, { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} });
  try {
    await fn(runtime);
  } finally {
    await runtime.close();
  }
}

test('openOffer presents a scannable QR per reachable endpoint', async () => {
  await withRuntime(async (rt) => {
    const offer = await rt.openOffer();
    ok(offer.uris.length >= 1);
    ok(offer.qr.length >= 1);
    for (const entry of offer.qr) {
      ok(offer.uris.includes(entry.uri), 'qr entry must reference a presented uri');
      ok(entry.svg.includes('<svg'), 'svg payload missing');
      ok(entry.host.length > 0);
    }
    if (offer.uris.length > 1) {
      ok(offer.qr.every((entry) => entry.host !== '127.0.0.1'), 'loopback QR must be suppressed when LAN endpoints exist');
    }
  });
});

test('state exposes the live offer for the management UI', async () => {
  await withRuntime(async (rt) => {
    const offer = await rt.openOffer();
    const view = rt.state().offer;
    deepStrictEqual(view?.offerId, offer.offerId);
    deepStrictEqual(view?.phase, 'open');
  });
});

test('currentOffer tracks open → claimed → gone after confirm', async () => {
  await withRuntime(async (rt) => {
    const offer = await rt.openOffer();
    deepStrictEqual(rt.gate.currentOffer()?.phase, 'open');

    rt.gate.claim(offer.offerId, 'test-phone', 'ed25519:test');
    const view = rt.gate.currentOffer();
    deepStrictEqual(view?.phase, 'claimed');
    deepStrictEqual(view?.claimedName, 'test-phone');

    deepStrictEqual(rt.state().offer?.phase, 'claimed');
    rt.confirm(offer.offerId);
    deepStrictEqual(rt.gate.currentOffer(), undefined);
  });
});
