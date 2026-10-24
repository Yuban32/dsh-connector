import * as tls from 'node:tls';
import { PSK_CIPHERS } from './ciphers.js';
const MAX_RESPONSE_BYTES = 1024 * 1024;
/** Client options differ per channel mode. */
function connectOptions(endpoint) {
    const base = {
        host: endpoint.host,
        port: endpoint.port,
        checkServerIdentity: () => undefined,
        rejectUnauthorized: false,
    };
    if (!endpoint.psk) {
        // Certificate mode: standard TLS, unverified self-signed cert.
        return { ...base, minVersion: 'TLSv1.2' };
    }
    return {
        ...base,
        pskCallback: () => ({ psk: endpoint.psk, identity: endpoint.identity }),
        ciphers: PSK_CIPHERS,
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.2',
    };
}
/** Await the TLS handshake; failures (wrong code, unknown id) reject cleanly. */
function waitForSecure(socket) {
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
        const onError = (error) => {
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
export async function pskRequest(endpoint, path, body, timeoutMs = 8000) {
    const socket = tls.connect(connectOptions(endpoint));
    socket.setTimeout(timeoutMs);
    try {
        await waitForSecure(socket);
        const header = `${body === undefined ? 'GET' : 'POST'} ${path} HTTP/1.1\r\n` +
            `host: ${endpoint.host}\r\n` +
            (body === undefined ? '' : `content-type: application/json\r\ncontent-length: ${body.length}\r\n`) +
            'connection: close\r\n\r\n';
        socket.write(header);
        if (body !== undefined)
            socket.write(body);
        const raw = await readAll(socket);
        return parseResponse(raw);
    }
    finally {
        socket.destroy();
    }
}
function readAll(socket) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        const onData = (chunk) => {
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
        const onError = (error) => {
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
function parseResponse(raw) {
    const split = raw.indexOf('\r\n\r\n');
    if (split < 0)
        throw new Error('malformed response: no header block');
    const head = raw.subarray(0, split).toString('utf8');
    const body = raw.subarray(split + 4);
    const statusLine = head.split('\r\n')[0] ?? '';
    const match = /^HTTP\/1\.[01] (\d{3})/.exec(statusLine);
    if (!match)
        throw new Error(`malformed response status: ${statusLine}`);
    return { status: Number(match[1]), body };
}
//# sourceMappingURL=psk-http-client.js.map