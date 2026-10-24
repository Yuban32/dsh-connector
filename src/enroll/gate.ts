import { randomBytes } from 'node:crypto';

import { DeviceRecord, DeviceVault, newDeviceId, newDeviceToken } from '../devices/vault.js';
import { generateCode, normalizeCode } from './codes.js';
import { deriveDevicePsk, deriveOfferPsk } from './psk.js';

export type GatePhase = 'open' | 'claimed' | 'enrolled' | 'closed';

export interface GateOffer {
  offerId: string;
  code: string;
  expiresAt: number;
  phase: GatePhase;
  deviceId?: string;
}

export interface OpenedOffer extends GateOffer {
  phase: 'open';
}

export interface ClaimResult {
  status: 'wait-confirm';
  hostFp: string;
}

export type PollResult =
  | { status: 'wait-confirm' }
  | { status: 'enrolled'; deviceId: string; token: string }
  | { status: 'expired' };

export interface GateEvents {
  onEvent?: (kind: string, detail?: Record<string, unknown>) => void;
}

/** Desktop-UI view of the one live offer (open, or claimed and awaiting confirmation). */
export interface LiveOfferView {
  offerId: string;
  expiresAt: number;
  phase: 'open' | 'claimed';
  claimedName?: string;
  claimedKeyFp?: string;
}

/**
 * Enrollment state machine.
 *
 * offer: open → claimed → (enrolled | closed | expired)
 * device: awaiting → enrolled → suspended
 *
 * The TLS layer proves possession of the offer code before any RPC reaches the
 * gate; claim() additionally re-checks the offer id carried in the request so
 * a connection cannot act on a different offer than the one it authenticated
 * against.
 */
export class Gate {
  private readonly offers = new Map<string, GateOffer>();
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly emit: (kind: string, detail?: Record<string, unknown>) => void;

  constructor(
    private readonly vault: DeviceVault,
    private readonly hostFp: string,
    options: { offerTtlMs: number; now?: () => number; events?: GateEvents },
  ) {
    this.ttlMs = options.offerTtlMs;
    this.now = options.now ?? Date.now;
    this.emit = options.events?.onEvent ?? (() => {});
  }

  openOffer(): OpenedOffer {
    // One live offer at a time: opening closes any previous unclaimed one.
    for (const offer of this.offers.values()) {
      if (offer.phase === 'open' || offer.phase === 'claimed') offer.phase = 'closed';
    }
    const offer: OpenedOffer = {
      offerId: `off_${randomBytes(12).toString('base64url')}`,
      code: generateCode(),
      expiresAt: this.now() + this.ttlMs,
      phase: 'open',
    };
    this.offers.set(offer.offerId, offer);
    this.emit('offer.open', { offerId: offer.offerId, expiresAt: offer.expiresAt });
    return offer;
  }

  claim(offerId: string, deviceName: string, keyFp?: string): ClaimResult {
    const offer = this.liveOffer(offerId);
    if (!offer || offer.phase !== 'open') throw new GateError('offer-closed', 'offer is not open for claims');
    const device: DeviceRecord = {
      deviceId: newDeviceId(),
      name: sanitizeName(deviceName),
      keyFp,
      token: newDeviceToken(),
      state: 'awaiting',
      offerId,
      enrolledAt: new Date().toISOString(),
    };
    this.vault.put(device);
    offer.phase = 'claimed';
    offer.deviceId = device.deviceId;
    this.emit('offer.claimed', { offerId, deviceId: device.deviceId });
    return { status: 'wait-confirm', hostFp: this.hostFp };
  }

  poll(offerId: string): PollResult {
    const offer = this.liveOffer(offerId);
    if (!offer) return { status: 'expired' };
    if (offer.phase === 'open') return { status: 'wait-confirm' };
    if (offer.phase === 'claimed') return { status: 'wait-confirm' };
    if (offer.phase === 'enrolled' && offer.deviceId) {
      const device = this.vault.get(offer.deviceId);
      if (device?.state === 'enrolled') {
        return { status: 'enrolled', deviceId: device.deviceId, token: device.token };
      }
    }
    return { status: 'expired' };
  }

  /** The live offer for the management UI, if any (enrolled offers are done). */
  currentOffer(): LiveOfferView | undefined {
    for (const offer of this.offers.values()) {
      const live = this.liveOffer(offer.offerId);
      if (!live || (live.phase !== 'open' && live.phase !== 'claimed')) continue;
      if (live.phase === 'claimed' && live.deviceId) {
        const device = this.vault.get(live.deviceId);
        return {
          offerId: live.offerId,
          expiresAt: live.expiresAt,
          phase: 'claimed',
          claimedName: device?.name,
          claimedKeyFp: device?.keyFp,
        };
      }
      return { offerId: live.offerId, expiresAt: live.expiresAt, phase: 'open' };
    }
    return undefined;
  }

  confirm(offerId: string): DeviceRecord {
    const offer = this.liveOffer(offerId);
    if (!offer?.deviceId) throw new GateError('unknown-offer', 'no claim pending for this offer');
    const device = this.vault.get(offer.deviceId);
    if (!device) throw new GateError('unknown-offer', 'claim record disappeared');
    device.state = 'enrolled';
    this.vault.put(device);
    offer.phase = 'enrolled';
    this.emit('device.enrolled', { offerId, deviceId: device.deviceId });
    return device;
  }

  suspend(deviceId: string): DeviceRecord {
    const device = this.vault.get(deviceId);
    if (!device) throw new GateError('unknown-device', 'no such device');
    device.state = 'suspended';
    this.vault.put(device);
    this.emit('device.suspended', { deviceId });
    return device;
  }

  /** PSK lookup used by the channel's TLS layer, keyed by client identity. */
  pskForIdentity(identity: string): Buffer | undefined {
    const offer = this.liveOffer(identity);
    // A live offer keeps its channel until expiry — the phone polls for the
    // enrollment outcome over it after the desktop-side confirmation.
    if (offer) {
      return deriveOfferPsk(offer.code, offer.offerId, this.hostFp);
    }
    const device = this.vault.get(identity);
    if (device?.state === 'enrolled') {
      return deriveDevicePsk(device.token, device.deviceId, this.hostFp);
    }
    return undefined;
  }

  /** True when the identity is a live offer id usable as a channel identity. */
  isOfferIdentity(identity: string): boolean {
    return this.liveOffer(identity) !== undefined;
  }

  /**
   * In-band code check for fallback channels whose TLS layer cannot carry the
   * code (certificate mode): the claim must present the offer code itself.
   */
  verifyOfferCode(offerId: string, code: unknown): boolean {
    const offer = this.liveOffer(offerId);
    if (!offer || offer.phase !== 'open') return false;
    return normalizeCode(String(code ?? '')) === offer.code;
  }

  private liveOffer(offerId: string): GateOffer | undefined {
    const offer = this.offers.get(offerId);
    if (!offer) return undefined;
    if (offer.phase !== 'enrolled' && offer.phase !== 'closed' && this.now() >= offer.expiresAt) {
      offer.phase = 'closed';
      this.emit('offer.expired', { offerId });
    }
    return offer.phase === 'closed' ? undefined : offer;
  }
}

export class GateError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'GateError';
  }
}

function sanitizeName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  return (name || 'unnamed device').slice(0, 64);
}
