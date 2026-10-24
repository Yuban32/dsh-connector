import { createHash, hkdfSync } from 'node:crypto';

const OFFER_INFO = 'ds-connector offer-channel v1';
const DEVICE_INFO = 'ds-connector device-channel v1';

function derive(secretUtf8: string, saltUtf8: string, info: string): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.from(secretUtf8, 'utf8'), Buffer.from(saltUtf8, 'utf8'), Buffer.from(info, 'utf8'), 32));
}

/**
 * Channel key for the enrollment phase. The offer code reaches the phone only
 * via the offer URI (QR / console printout) — never over the network — so
 * possession of the derived PSK at the TLS layer is the proof of a valid code.
 */
export function deriveOfferPsk(code: string, offerId: string, hostFp: string): Buffer {
  return derive(code, offerId, `${OFFER_INFO} ${hostFp}`);
}

/** Channel key for an enrolled device reconnecting with its long-term token. */
export function deriveDevicePsk(token: string, deviceId: string, hostFp: string): Buffer {
  return derive(token, deviceId, `${DEVICE_INFO} ${hostFp}`);
}

/** Short helper for diagnostics that never leaks key material. */
export function pskPreview(psk: Buffer): string {
  return createHash('sha256').update(psk).digest('base64url').slice(0, 8);
}
