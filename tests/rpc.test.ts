import { deepStrictEqual, rejects, throws } from 'node:assert';
import { test } from 'node:test';

import { createRouter, decodeEnvelope, encodeErr, encodeOk, errorPayload, RpcError } from '../dist/channel/rpc.js';

function envelope(overrides: Partial<Record<string, unknown>> = {}): Buffer {
  return Buffer.from(JSON.stringify({ v: 1, id: 7, method: 'ping', params: {}, ...overrides }));
}

test('decodeEnvelope accepts a well-formed request', () => {
  const env = decodeEnvelope(envelope({ method: 'enroll.claim', params: { offerId: 'off_1' } }));
  deepStrictEqual(env.v, 1);
  deepStrictEqual(env.id, 7);
  deepStrictEqual(env.method, 'enroll.claim');
  deepStrictEqual(env.params, { offerId: 'off_1' });
});

test('decodeEnvelope rejects malformed input with typed codes', () => {
  throws(() => decodeEnvelope(Buffer.from('not json')), RpcError);
  throws(() => decodeEnvelope(Buffer.from('"string"')), RpcError);
  throws(() => decodeEnvelope(envelope({ v: 99 })), (e: unknown) => e instanceof RpcError && e.code === 'bad-version');
  throws(() => decodeEnvelope(envelope({ method: undefined })), RpcError);
  throws(() => decodeEnvelope(envelope({ params: 'nope' })), RpcError);
});

test('encode helpers round-trip', () => {
  deepStrictEqual(JSON.parse(encodeOk(7, { a: 1 }).toString()), { v: 1, id: 7, result: { a: 1 } });
  deepStrictEqual(JSON.parse(encodeErr('x', 'bad', 'msg').toString()), {
    v: 1,
    id: 'x',
    error: { code: 'bad', message: 'msg' },
  });
});

test('router dispatches and reports unknown methods', async () => {
  const router = createRouter({ echo: async (params) => params });
  deepStrictEqual(await router('echo', { x: 1 }, 'dev_1'), { x: 1 });
  await rejects(
    () => router('nope', {}, 'dev_1'),
    (e: unknown) => e instanceof RpcError && e.code === 'unknown-method',
  );
});

test('errorPayload maps typed errors and falls back to internal', () => {
  deepStrictEqual(errorPayload(new RpcError('a', 'b')), { code: 'a', message: 'b' });
  const plain = errorPayload(new Error('boom'));
  deepStrictEqual(plain.code, 'internal');
  deepStrictEqual(plain.message, 'boom');
});
