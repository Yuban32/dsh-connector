import { deepStrictEqual, notDeepStrictEqual, ok, throws } from 'node:assert';
import { test } from 'node:test';

import { DeviceVault } from '../dist/devices/vault.js';
import { Gate, GateError } from '../dist/enroll/gate.js';
import { makeGate } from './helpers.js';

test('open → claim → confirm → poll full cycle', () => {
  const { gate, hostFp } = makeGate();
  const offer = gate.openOffer();
  ok(offer.offerId.startsWith('off_'));
  ok(offer.code.length === 8);

  const claim = gate.claim(offer.offerId, 'phone of user');
  deepStrictEqual(claim.status, 'wait-confirm');
  deepStrictEqual(claim.hostFp, hostFp);

  deepStrictEqual(gate.poll(offer.offerId).status, 'wait-confirm');

  const device = gate.confirm(offer.offerId);
  deepStrictEqual(device.state, 'enrolled');
  deepStrictEqual(device.name, 'phone of user');

  const poll = gate.poll(offer.offerId);
  deepStrictEqual(poll.status, 'enrolled');
  if (poll.status === 'enrolled') {
    deepStrictEqual(poll.deviceId, device.deviceId);
    deepStrictEqual(poll.token, device.token);
  }
});

test('a fresh offer closes the previous live one', () => {
  const { gate } = makeGate();
  const first = gate.openOffer();
  gate.openOffer();
  throws(() => gate.claim(first.offerId, 'late device'), GateError);
});

test('claim requires an open offer; confirm requires a claim', () => {
  const { gate } = makeGate();
  throws(() => gate.claim('off_missing', 'device'), GateError);
  throws(() => gate.confirm('off_missing'), GateError);
});

test('offers expire after the ttl', () => {
  let clock = 1_000_000;
  const { gate } = makeGate(60_000, () => clock);
  const offer = gate.openOffer();
  clock += 61_000;
  throws(() => gate.claim(offer.offerId, 'device'), GateError);
  deepStrictEqual(gate.poll(offer.offerId).status, 'expired');
});

test('pskForIdentity distinguishes offers and devices', () => {
  const { gate } = makeGate();
  const offer = gate.openOffer();
  const offerPsk = gate.pskForIdentity(offer.offerId);
  ok(offerPsk);
  deepStrictEqual(gate.pskForIdentity('off_unknown'), undefined);

  gate.claim(offer.offerId, 'device');
  const device = gate.confirm(offer.offerId);
  const devicePsk = gate.pskForIdentity(device.deviceId);
  ok(devicePsk);
  notDeepStrictEqual(devicePsk, offerPsk);

  gate.suspend(device.deviceId);
  deepStrictEqual(gate.pskForIdentity(device.deviceId), undefined);
});

test('vault persists devices and reloads with a matching host', () => {
  const { dir, gate, vault } = makeGate();
  const offer = gate.openOffer();
  gate.claim(offer.offerId, 'persistent phone');
  const device = gate.confirm(offer.offerId);

  const reloaded = DeviceVault.load(dir, vault.hostFp);
  deepStrictEqual(reloaded.list('enrolled').length, 1);
  deepStrictEqual(reloaded.get(device.deviceId)?.name, 'persistent phone');
});

test('vault resets when the host fingerprint changes', () => {
  const { dir, gate, vault } = makeGate();
  const offer = gate.openOffer();
  gate.claim(offer.offerId, 'device');
  gate.confirm(offer.offerId);
  deepStrictEqual(vault.list('enrolled').length, 1);

  const foreign = DeviceVault.load(dir, 'ed25519:different-host-fp');
  deepStrictEqual(foreign.list().length, 0);
});
