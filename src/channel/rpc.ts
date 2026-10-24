import { WIRE_VERSION } from '../metadata.js';
import { GateError } from '../enroll/gate.js';

export interface RpcEnvelope {
  v: number;
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface RpcResult {
  result?: unknown;
  error?: { code: string; message: string };
}

export type RpcMethod = (params: Record<string, unknown>, identity: string) => Promise<unknown>;

export type RpcRouter = (method: string, params: Record<string, unknown>, identity: string) => Promise<unknown>;

export class RpcError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'RpcError';
  }
}

export function decodeEnvelope(body: Buffer): RpcEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString('utf8'));
  } catch {
    throw new RpcError('bad-envelope', 'request body is not JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) throw new RpcError('bad-envelope', 'envelope must be an object');
  const env = parsed as Record<string, unknown>;
  if (env['v'] !== WIRE_VERSION) throw new RpcError('bad-version', `unsupported wire version: ${String(env['v'])}`);
  if (typeof env['id'] !== 'string' && typeof env['id'] !== 'number') throw new RpcError('bad-envelope', 'missing id');
  if (typeof env['method'] !== 'string' || env['method'] === '') throw new RpcError('bad-envelope', 'missing method');
  if (env['params'] !== undefined && (typeof env['params'] !== 'object' || env['params'] === null)) {
    throw new RpcError('bad-envelope', 'params must be an object');
  }
  return {
    v: WIRE_VERSION,
    id: env['id'] as string | number,
    method: env['method'],
    params: (env['params'] ?? {}) as Record<string, unknown>,
  };
}

export function encodeOk(id: string | number, result: unknown): Buffer {
  return Buffer.from(JSON.stringify({ v: WIRE_VERSION, id, result }));
}

export function encodeErr(id: string | number, code: string, message: string): Buffer {
  return Buffer.from(JSON.stringify({ v: WIRE_VERSION, id, error: { code, message } }));
}

/** Dispatch table; method names are plain strings on the single RPC path. */
export function createRouter(methods: Record<string, RpcMethod>): RpcRouter {
  return async (method, params, identity) => {
    const handler = methods[method];
    if (!handler) throw new RpcError('unknown-method', `no handler for ${method}`);
    return handler(params, identity);
  };
}

export function errorPayload(error: unknown): { code: string; message: string } {
  if (error instanceof RpcError) return { code: error.code, message: error.message };
  if (error instanceof GateError) return { code: error.code, message: error.message };
  return { code: 'internal', message: error instanceof Error ? error.message : 'unknown failure' };
}
