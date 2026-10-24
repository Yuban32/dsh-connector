import * as tls from 'node:tls';

import { PSK_CIPHERS } from './ciphers.js';

export interface PskEndpoint {
  host: string;
  port: number;
  identity: string;
  psk: Buffer;
}

export interface PskHttpResponse {
  status: number;
  body: Buffer;
}

const MAX_RESPONSE_BYTES = 1024 * 1024;

/**
 * Minimal HTTP/1.1 exchange over a TLS-PSK connection, used by the smoke
 * script and tests to play the phone side.
 *
 * The request is written by hand onto the secured socket and the response is
 * read to EOF: the channel always replies with an explicit content-length and
 * we always send `Connection: close`, so one read loop covers every response.
 * Node's own http client is not used here — its agent plumbing is hard to pin
 * to a pre-built TLS socket.
 */
export async function pskRequest(
  endpoint: PskEndpoint,
  path: string,
  body?: Buffer,
  timeoutMs = 8000,
): Promise<PskHttpResponse> {
  const socket = tls.connect({
    host: endpoint.host,
    port: endpoint.port,
    pskCallback: () => ({ psk: endpoint.psk, identity: endpoint.identity }),
    ciphers: PSK_CIPHERS,
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.2',
    // PSK channels carry no certificate; hostname verification does not apply.
    checkServerIdentity: () => undefined,
    rejectUnauthorized: false,
  });
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

function waitForSecure(socket: tls.TLSSocket): Promise<void> {
  // Attached synchronously right after tls.connect(), so secureConnect always
  // fires later; TLS would buffer early writes anyway, but awaiting surfaces
  // handshake failures (wrong code, unknown identity) as clean errors.
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
      reject(error);
    };
    const onClose = () => {
      cleanup();
      reject(new Error('connection closed during PSK handshake'));
    };
    const onTimeout = () => {
      cleanup();
      socket.destroy();
      reject(new Error('PSK handshake timed out'));
    };
    socket.once('secureConnect', onSecure);
    socket.once('error', onError);
    socket.once('close', onClose);
    socket.once('timeout', onTimeout);
  });
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
