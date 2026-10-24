#!/usr/bin/env node
/**
 * End-to-end enrollment smoke test: plays the phone side against a live
 * runtime (inside the harness, or a standalone `createRuntime`).
 *
 * Usage: node scripts/smoke-enroll.mjs [--console http://127.0.0.1:28471]
 */
import { createHash, generateKeyPairSync, hkdfSync } from 'node:crypto';

import { pskRequest } from '../dist/channel/direct/psk-http-client.js';

const consoleBase = (() => {
  const flag = process.argv.indexOf('--console');
  return flag >= 0 ? process.argv[flag + 1] : 'http://127.0.0.1:28471';
})();

const log = (step, detail) => console.log(`[${step}] ${detail ?? ''}`);
const fail = (step, error) => {
  console.error(`[${step}] FAILED: ${error?.message ?? error}`);
  process.exit(1);
};

async function consoleCall(path, body) {
  const response = await fetch(`${consoleBase}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(`${path} -> ${response.status} ${JSON.stringify(json)}`);
  return json;
}

function parseOfferUri(uri) {
  const parsed = new URL(uri);
  const q = parsed.searchParams;
  return {
    host: q.get('h'),
    port: Number(q.get('p')),
    offerId: q.get('o'),
    hostFp: decodeURIComponent(q.get('fp') ?? ''),
    code: q.get('c'),
    t: q.get('t') ?? 'psk',
  };
}
function offerPskOf(parsed, codeOverride) {
  const code = codeOverride ?? parsed.code;
  return Buffer.from(hkdfSync('sha256', Buffer.from(code), Buffer.from(parsed.offerId), Buffer.from(`ds-connector offer-channel v1 ${parsed.hostFp}`), 32));
}

function devicePskOf(token, deviceId, hostFp) {
  return Buffer.from(hkdfSync('sha256', Buffer.from(token), Buffer.from(deviceId), Buffer.from(`ds-connector device-channel v1 ${hostFp}`), 32));
}

async function rpc(endpoint, method, params) {
  const body = Buffer.from(JSON.stringify({ v: 1, id: Date.now(), method, params }));
  const response = await pskRequest(endpoint, `/rpc/${endpoint.identity}`, body);
  const json = JSON.parse(response.body.toString('utf8'));
  if (json.error) throw new Error(`rpc ${method} -> ${json.error.code}: ${json.error.message}`);
  return json.result;
}

async function expectHandshakeFailure(endpoint) {
  try {
    await pskRequest(endpoint, `/rpc/${endpoint.identity}/health`);
  } catch {
    log('neg', 'handshake rejected as expected');
    return;
  }
  throw new Error('handshake unexpectedly succeeded');
}

async function main() {
  log('state', `asking ${consoleBase}/state`);
  const state = await consoleCall('/state');
  if (!state.direct || state.direct.status !== 'ready') {
    throw new Error(`direct channel not ready: ${JSON.stringify(state.direct)}`);
  }
  log('state', `version=${state.version} mode=${state.direct?.mode} port=${state.direct?.port}`);

  log('offer', 'opening enrollment offer');
  const offer = await consoleCall('/offer');
  log('offer', `offerId=${offer.offerId} code=${offer.code} mode=${offer.uris?.[0]?.match(/[?&]t=([a-z-]+)/)?.[1]}`);

  const parsed = parseOfferUri(offer.uris.at(-1)); // last entry = 127.0.0.1
  const pskMode = parsed.t !== 'cert';

  const deviceKeypair = generateKeyPairSync('ed25519');
  const devicePubRaw = deviceKeypair.publicKey.export({ type: 'spki', format: 'der' }).subarray(12);
  const keyFp = `ed25519:${createHash('sha256').update(devicePubRaw).digest('base64url')}`;

  const endpointFor = (identity, psk) => ({ host: parsed.host, port: parsed.port, identity, psk });

  if (pskMode) {
    // Negative: unknown identity must fail the PSK handshake.
    await expectHandshakeFailure(endpointFor('off_unknown', offerPskOf(parsed)));
    // Negative: wrong code derives a different PSK — must also fail.
    await expectHandshakeFailure(endpointFor(parsed.offerId, offerPskOf(parsed, 'XXXXXXXX')));
  }

  const offerEndpoint = endpointFor(parsed.offerId, pskMode ? offerPskOf(parsed) : undefined);
  const claimParams = { offerId: parsed.offerId, deviceName: 'smoke-device', keyFp };
  if (!pskMode) claimParams.code = parsed.code; // in-band code check in cert mode

  log('claim', 'claiming the offer');
  const claim = await rpc(offerEndpoint, 'enroll.claim', claimParams);
  if (claim.status !== 'wait-confirm') throw new Error(`claim returned ${claim.status}`);

  const confirmed = await consoleCall('/confirm', { offerId: parsed.offerId });
  log('confirm', `confirmed device ${confirmed.deviceId} (${confirmed.name})`);

  const poll = await rpc(offerEndpoint, 'enroll.poll', { offerId: parsed.offerId });
  if (poll.status !== 'enrolled') throw new Error(`poll returned ${poll.status}`);
  log('enroll', `enrolled deviceId=${poll.deviceId}`);

  const deviceEndpoint = endpointFor(poll.deviceId, pskMode ? devicePskOf(poll.token, poll.deviceId, parsed.hostFp) : undefined);
  const ping = await rpc(deviceEndpoint, 'device.ping', {});
  if (!ping.ok) throw new Error('device.ping did not acknowledge');
  log('ping', 'device channel ok');

  const suspended = await rpc(deviceEndpoint, 'device.suspend', {});
  log('suspend', `device state=${suspended.state}`);

  if (pskMode) {
    await expectHandshakeFailure(deviceEndpoint);
  } else {
    // Cert mode: suspended devices fail at the RPC layer instead.
    try {
      await rpc(deviceEndpoint, 'device.ping', {});
      throw new Error('suspended device unexpectedly served');
    } catch (error) {
      if (String(error.message).includes('unexpectedly served')) throw error;
      log('neg', `suspended device rejected as expected (${error.message})`);
    }
  }

  console.log('\nSMOKE PASS: enrollment → confirm → reconnect → suspend all verified.');
}

main().catch((error) => fail('main', error));
