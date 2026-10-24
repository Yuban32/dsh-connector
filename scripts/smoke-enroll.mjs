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

const DEVICE_CIPHERS = 'PSK-AES256-GCM-SHA384';

function log(step, detail) {
  console.log(`[${step}] ${detail ?? ''}`);
}

function fail(step, error) {
  console.error(`[${step}] FAILED: ${error?.message ?? error}`);
  process.exit(1);
}

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
  return { host: q.get('h'), port: Number(q.get('p')), offerId: q.get('o'), hostFp: decodeURIComponent(q.get('fp')), code: q.get('c') };
}

function offerPsk(code, offerId, hostFp) {
  return Buffer.from(hkdfSync('sha256', Buffer.from(code), Buffer.from(offerId), Buffer.from(`ds-connector offer-channel v1 ${hostFp}`), 32));
}

function devicePsk(token, deviceId, hostFp) {
  return Buffer.from(hkdfSync('sha256', Buffer.from(token), Buffer.from(deviceId), Buffer.from(`ds-connector device-channel v1 ${hostFp}`), 32));
}

async function rpc(endpoint, method, params) {
  const body = Buffer.from(JSON.stringify({ v: 1, id: Date.now(), method, params }));
  const response = await pskRequest(endpoint, `/rpc/${endpoint.identity}`, body);
  const json = JSON.parse(response.body.toString('utf8'));
  if (json.error) throw new Error(`rpc ${method} -> ${json.error.code}: ${json.error.message}`);
  return json.result;
}

/** A TLS-PSK connection must fail when the PSK is wrong or unknown. */
function expectHandshakeFailure(endpoint) {
  return pskRequest(endpoint, `/rpc/${endpoint.identity}/health`)
    .then(() => {
      throw new Error('handshake unexpectedly succeeded');
    })
    .catch((error) => {
      if (error.message === 'handshake unexpectedly succeeded') throw error;
      log('neg', `handshake rejected as expected (${error.message})`);
    });
}

async function main() {
  log('state', `asking ${consoleBase}/state`);
  const state = await consoleCall('/state');
  if (!state.direct || state.direct.status !== 'ready') {
    throw new Error(`direct channel not ready: ${JSON.stringify(state.direct)}`);
  }
  log('state', `hostFp=${state.hostFp} port=${state.direct.port}`);

  log('offer', 'opening enrollment offer');
  const offer = await consoleCall('/offer');
  log('offer', `offerId=${offer.offerId} code=${offer.code} uris=${offer.uris.length}`);

  const parsed = parseOfferUri(offer.uris.at(-1)); // last entry is 127.0.0.1
  const deviceKeypair = generateKeyPairSync('ed25519');
  const devicePubRaw = deviceKeypair.publicKey.export({ type: 'spki', format: 'der' }).subarray(12);
  const keyFp = `ed25519:${createHash('sha256').update(devicePubRaw).digest('base64url')}`;

  // Negative: an unknown identity must never complete a handshake.
  await expectHandshakeFailure({
    host: parsed.host,
    port: parsed.port,
    identity: 'off_does-not-exist',
    psk: offerPsk(parsed.code, parsed.offerId, parsed.hostFp),
  });
  // Negative: a wrong code must never complete a handshake.
  await expectHandshakeFailure({
    host: parsed.host,
    port: parsed.port,
    identity: parsed.offerId,
    psk: offerPsk('XXXXXXXX', parsed.offerId, parsed.hostFp),
  });

  const offerEndpoint = {
    host: parsed.host,
    port: parsed.port,
    identity: parsed.offerId,
    psk: offerPsk(parsed.code, parsed.offerId, parsed.hostFp),
  };

  log('claim', 'claiming the offer over the PSK channel');
  const claim = await rpc(offerEndpoint, 'enroll.claim', {
    offerId: parsed.offerId,
    deviceName: 'smoke-device',
    keyFp,
  });
  if (claim.status !== 'wait-confirm') throw new Error(`claim returned ${claim.status}`);
  log('claim', 'desktop-side confirmation pending');

  const confirmed = await consoleCall('/confirm', { offerId: parsed.offerId });
  log('confirm', `confirmed device ${confirmed.deviceId} (${confirmed.name})`);

  const poll = await rpc(offerEndpoint, 'enroll.poll', { offerId: parsed.offerId });
  if (poll.status !== 'enrolled') throw new Error(`poll returned ${poll.status}`);
  log('enroll', `enrolled deviceId=${poll.deviceId}`);

  const deviceEndpoint = {
    host: parsed.host,
    port: parsed.port,
    identity: poll.deviceId,
    psk: devicePsk(poll.token, poll.deviceId, parsed.hostFp),
  };
  const ping = await rpc(deviceEndpoint, 'device.ping', {});
  if (!ping.ok) throw new Error('device.ping did not acknowledge');
  log('ping', `device channel ok (serverTime=${ping.serverTime})`);

  const suspended = await rpc(deviceEndpoint, 'device.suspend', {});
  log('suspend', `device state=${suspended.state}`);

  await expectHandshakeFailure(deviceEndpoint);
  log('neg', 'suspended device can no longer connect');

  console.log('\nSMOKE PASS: enrollment → confirm → reconnect → suspend all verified.');
}

main().catch((error) => fail('main', error));
