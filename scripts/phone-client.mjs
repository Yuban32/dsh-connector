#!/usr/bin/env node
/**
 * Phone-side stand-in for enrollment testing — a single self-contained file
 * (Node builtins only) that runs anywhere Node >= 22 runs: Termux on the
 * phone, or any second machine on the same Wi-Fi as the desktop.
 *
 *   node phone-client.mjs '<dsconnect://l?v=1&h=...&c=...>' [--name my-phone]
 *
 * Flow: claim the offer → wait for the desktop-side confirm (button in the
 * DS Connector tab) → poll until enrolled → keep the device channel alive
 * with periodic pings until Ctrl+C.
 *
 * This file is intentionally dependency-free so it can be copied to the
 * device alone, without the repository.
 */
import { createHash, generateKeyPairSync, hkdfSync } from 'node:crypto';
import * as tls from 'node:tls';

const log = (step, detail) => console.log(`[${step}] ${detail ?? ''}`);

// ---------- offer URI ----------

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
  return Buffer.from(hkdfSync(
    'sha256',
    Buffer.from(code),
    Buffer.from(parsed.offerId),
    Buffer.from(`ds-connector offer-channel v1 ${parsed.hostFp}`),
    32,
  ));
}

function devicePskOf(token, deviceId, hostFp) {
  return Buffer.from(hkdfSync(
    'sha256',
    Buffer.from(token),
    Buffer.from(deviceId),
    Buffer.from(`ds-connector device-channel v1 ${hostFp}`),
    32,
  ));
}

// ---------- minimal single-request TLS client (PSK or certificate mode) ----------

async function tlsRequest(endpoint, path, body, timeoutMs = 8000) {
  const options = {
    host: endpoint.host,
    port: endpoint.port,
    checkServerIdentity: () => undefined,
    rejectUnauthorized: false,
    minVersion: 'TLSv1.2',
  };
  if (endpoint.psk) {
    options.pskCallback = () => ({ psk: endpoint.psk, identity: endpoint.identity });
    options.ciphers = 'TLS_PSK_WITH_AES_256_GCM_SHA384:TLS_PSK_WITH_AES_128_GCM_SHA256';
    options.maxVersion = 'TLSv1.2';
  }
  const socket = tls.connect(options);
  socket.setTimeout(timeoutMs);
  await new Promise((resolve, reject) => {
    const fail = (error) => { socket.destroy(); reject(error); };
    socket.once('secureConnect', resolve);
    socket.once('error', fail);
    socket.once('close', () => fail(new Error('connection closed during TLS handshake')));
    socket.once('timeout', () => fail(new Error('TLS handshake timed out (host unreachable?)')));
  });
  try {
    const header =
      `POST ${path} HTTP/1.1\r\n` +
      `host: ${endpoint.host}\r\n` +
      `content-type: application/json\r\ncontent-length: ${body.length}\r\n` +
      'connection: close\r\n\r\n';
    socket.write(header);
    socket.write(body);
    const raw = await new Promise((resolve, reject) => {
      const chunks = [];
      socket.on('data', (chunk) => chunks.push(chunk));
      socket.on('end', () => resolve(Buffer.concat(chunks)));
      socket.on('error', reject);
      socket.on('timeout', () => reject(new Error('response timed out')));
    });
    const split = raw.indexOf('\r\n\r\n');
    if (split < 0) throw new Error('malformed response: no header block');
    const status = Number(/^HTTP\/1\.[01] (\d{3})/.exec(raw.subarray(0, split).toString('utf8'))?.[1] ?? 0);
    return JSON.parse(raw.subarray(split + 4).toString('utf8'));
  } finally {
    socket.destroy();
  }
}

async function rpc(endpoint, method, params) {
  const body = Buffer.from(JSON.stringify({ v: 1, id: Date.now(), method, params }));
  const json = await tlsRequest(endpoint, `/rpc/${endpoint.identity}`, body);
  if (json.error) throw new Error(`rpc ${method} -> ${json.error.code}: ${json.error.message}`);
  return json.result;
}

// ---------- enrollment flow ----------

async function pollUntilEnrolled(endpoint, offerId) {
  for (;;) {
    const poll = await rpc(endpoint, 'enroll.poll', { offerId });
    if (poll.status === 'enrolled') return poll;
    if (poll.status === 'expired') throw new Error('offer expired before confirmation');
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

async function main() {
  const args = process.argv.slice(2);
  const uri = args.find((a) => a.startsWith('dsconnect://'));
  if (!uri) {
    console.error('usage: node phone-client.mjs \'<dsconnect://l?v=1&h=...&c=...>\' [--name my-phone]');
    process.exit(1);
  }
  const nameFlag = args.indexOf('--name');
  const deviceName = nameFlag >= 0 ? String(args[nameFlag + 1] ?? '') || 'harmonyos-phone' : 'harmonyos-phone';

  const parsed = parseOfferUri(uri);
  const pskMode = parsed.t !== 'cert';
  log('offer', `host=${parsed.host}:${parsed.port} mode=${parsed.t} offerId=${parsed.offerId}`);

  const keypair = generateKeyPairSync('ed25519');
  const pubRaw = keypair.publicKey.export({ type: 'spki', format: 'der' }).subarray(12);
  const keyFp = `ed25519:${createHash('sha256').update(pubRaw).digest('base64url')}`;

  const offerEndpoint = {
    host: parsed.host,
    port: parsed.port,
    identity: parsed.offerId,
    psk: pskMode ? offerPskOf(parsed) : undefined,
  };
  const claimParams = { offerId: parsed.offerId, deviceName, keyFp };
  if (!pskMode) claimParams.code = parsed.code; // in-band code proof in cert mode

  log('claim', 'claiming the offer…');
  const claim = await rpc(offerEndpoint, 'enroll.claim', claimParams);
  log('claim', `${claim.status} — 请在桌面端 DS Connector 页面点击「确认入网」`);

  const poll = await pollUntilEnrolled(offerEndpoint, parsed.offerId);
  log('enroll', `deviceId=${poll.deviceId} token=${poll.token.slice(0, 8)}…（完整 token 不回显）`);

  const deviceEndpoint = {
    host: parsed.host,
    port: parsed.port,
    identity: poll.deviceId,
    psk: pskMode ? devicePskOf(poll.token, poll.deviceId, parsed.hostFp) : undefined,
  };
  const pingOnce = async () => {
    try {
      const pong = await rpc(deviceEndpoint, 'device.ping', {});
      log('ping', `ok serverTime=${pong.serverTime}`);
    } catch (error) {
      console.error(`[ping] FAILED: ${error.message}`);
    }
  };
  await pingOnce();
  setInterval(pingOnce, 15000);
  log('idle', 'device channel alive — Ctrl+C 退出');
}

main().catch((error) => {
  console.error(`[fatal] ${error.message}`);
  if (/ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH/.test(error.message)) {
    console.error('[hint] 手机与桌面必须在同一 Wi-Fi 网段；检查桌面防火墙是否放行入站 ' +
      '（Windows 首次监听会弹防火墙确认，选“允许”）。');
  }
  process.exit(1);
});
