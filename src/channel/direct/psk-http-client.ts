import * as tls from 'node:tls';

import { PSK_CIPHERS } from './ciphers.js';

export interface PskEndpoint {
  host: string;
  port: number;
  identity: string;
  /** Present = PSK mode; absent = certificate mode (standard TLS, unverified cert). */
  psk?: Buffer;
}

export interface PskHttpResponse {
  status: number;
  body: Buffer;
}

const MAX_RESPONSE_BYTES = 1024 * 1024;

/** Client options differ per channel mode. */
function connectOptions(endpoint: PskEndpoint): tls.ConnectionOptions {
  const base = {
    host: endpoint.host,
    port: endpoint.port,
    checkServerIdentity: () => undefined,
    rejectUnauthorized: false,
  };
  if (!endpoint.psk) {
    // Certificate mode: standard TLS, unverified self-signed cert.
    return { ...base, minVersion: 'TLSv1.2' } as tls.ConnectionOptions;
  }
  return {
    ...base,
    pskCallback: () => ({ psk: endpoint.psk, identity: endpoint.identity }),
    ciphers: PSK_CIPHERS,
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.2',
  } as tls.ConnectionOptions;
}

/** Await the TLS handshake; failures (wrong code, unknown id) reject cleanly. */
function waitForSecure(socket: tls.TLSSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      socket.removeListener('secureConnect', onSecure);
      socket.removeListener('error', onError);
      socket.removeListener('close', onClose);
      socket.removeListener('timeout', onTimeout);
    };
    const onSecure = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      socket.destroy();
      reject(error);
    };
    const onClose = () => {
      cleanup();
      socket.destroy();
      reject(new Error('connection closed during TLS handshake'));
    };
    const onTimeout = () => {
      cleanup();
      socket.destroy();
      reject(new Error('TLS handshake timed out'));
    };
    socket.once('secureConnect', onSecure);
    socket.once('error', onError);
    socket.once('close', onClose);
    socket.once('timeout', onTimeout);
  });
}

/** One-shot request: write by hand, read to EOF (server closes; length known). */
export async function pskRequest(
  endpoint: PskEndpoint,
  path: string,
  body?: Buffer,
  timeoutMs = 8000,
): Promise<PskHttpResponse> {
  const socket = tls.connect(connectOptions(endpoint));
  socket.setTimeout(timeoutMs);
  try {
    await waitForSecure(socket);
    const header =
      `${body === undefined ? 'GET' : 'POST'} ${path} HTTP/1.1\r\n` +
      `host: ${endpoint.host}\r\n` +
      (body === undefined ? '' : `content-type: application/json\r\ncontent-length: ${body.length}\r\n`) +
      'connection: close\r\n\r\n';
    socket.write(header);
    if (body !== undefined) socket.write(body);
    const raw = await readAll(socket);
    return parseResponse(raw);
  } finally {
    socket.destroy();
  }
}

function readAll(socket: tls.TLSSocket): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const onData = (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_RESPONSE_BYTES) {
        cleanup();
        reject(new Error('response too large'));
        socket.destroy();
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      cleanup();
      resolve(Buffer.concat(chunks));
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onTimeout = () => {
      cleanup();
      socket.destroy();
      reject(new Error('response timed out'));
    };
    const cleanup = () => {
      socket.removeListener('data', onData);
      socket.removeListener('end', onEnd);
      socket.removeListener('error', onError);
      socket.removeListener('timeout', onTimeout);
    };
    socket.on('data', onData);
    socket.on('end', onEnd);
    socket.on('error', onError);
    socket.on('timeout', onTimeout);
  });
}

function parseResponse(raw: Buffer): PskHttpResponse {
  const split = raw.indexOf('\r\n\r\n');
  if (split < 0) throw new Error('malformed response: no header block');
  const head = raw.subarray(0, split).toString('utf8');
  const body = raw.subarray(split + 4);
  const statusLine = head.split('\r\n')[0] ?? '';
  const match = /^HTTP\/1\.[01] (\d{3})/.exec(statusLine);
  if (!match) throw new Error(`malformed response status: ${statusLine}`);
  return { status: Number(match[1]), body };
}
