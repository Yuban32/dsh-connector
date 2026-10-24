/**
 * Channel key for the enrollment phase. The offer code reaches the phone only
 * via the offer URI (QR / console printout) — never over the network — so
 * possession of the derived PSK at the TLS layer is the proof of a valid code.
 */
export declare function deriveOfferPsk(code: string, offerId: string, hostFp: string): Buffer;
/** Channel key for an enrolled device reconnecting with its long-term token. */
export declare function deriveDevicePsk(token: string, deviceId: string, hostFp: string): Buffer;
/** Short helper for diagnostics that never leaks key material. */
export declare function pskPreview(psk: Buffer): string;
//# sourceMappingURL=psk.d.ts.map