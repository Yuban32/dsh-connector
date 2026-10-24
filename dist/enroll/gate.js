import { randomBytes } from 'node:crypto';
import { newDeviceId, newDeviceToken } from '../devices/vault.js';
import { generateCode, normalizeCode } from './codes.js';
import { deriveDevicePsk, deriveOfferPsk } from './psk.js';
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
    vault;
    hostFp;
    offers = new Map();
    ttlMs;
    now;
    emit;
    constructor(vault, hostFp, options) {
        this.vault = vault;
        this.hostFp = hostFp;
        this.ttlMs = options.offerTtlMs;
        this.now = options.now ?? Date.now;
        this.emit = options.events?.onEvent ?? (() => { });
    }
    openOffer() {
        // One live offer at a time: opening closes any previous unclaimed one.
        for (const offer of this.offers.values()) {
            if (offer.phase === 'open' || offer.phase === 'claimed')
                offer.phase = 'closed';
        }
        const offer = {
            offerId: `off_${randomBytes(12).toString('base64url')}`,
            code: generateCode(),
            expiresAt: this.now() + this.ttlMs,
            phase: 'open',
        };
        this.offers.set(offer.offerId, offer);
        this.emit('offer.open', { offerId: offer.offerId, expiresAt: offer.expiresAt });
        return offer;
    }
    claim(offerId, deviceName, keyFp) {
        const offer = this.liveOffer(offerId);
        if (!offer || offer.phase !== 'open')
            throw new GateError('offer-closed', 'offer is not open for claims');
        const device = {
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
    poll(offerId) {
        const offer = this.liveOffer(offerId);
        if (!offer)
            return { status: 'expired' };
        if (offer.phase === 'open')
            return { status: 'wait-confirm' };
        if (offer.phase === 'claimed')
            return { status: 'wait-confirm' };
        if (offer.phase === 'enrolled' && offer.deviceId) {
            const device = this.vault.get(offer.deviceId);
            if (device?.state === 'enrolled') {
                return { status: 'enrolled', deviceId: device.deviceId, token: device.token };
            }
        }
        return { status: 'expired' };
    }
    /** The live offer for the management UI, if any (enrolled offers are done). */
    currentOffer() {
        for (const offer of this.offers.values()) {
            const live = this.liveOffer(offer.offerId);
            if (!live || (live.phase !== 'open' && live.phase !== 'claimed'))
                continue;
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
    confirm(offerId) {
        const offer = this.liveOffer(offerId);
        if (!offer?.deviceId)
            throw new GateError('unknown-offer', 'no claim pending for this offer');
        const device = this.vault.get(offer.deviceId);
        if (!device)
            throw new GateError('unknown-offer', 'claim record disappeared');
        device.state = 'enrolled';
        this.vault.put(device);
        offer.phase = 'enrolled';
        this.emit('device.enrolled', { offerId, deviceId: device.deviceId });
        return device;
    }
    suspend(deviceId) {
        const device = this.vault.get(deviceId);
        if (!device)
            throw new GateError('unknown-device', 'no such device');
        device.state = 'suspended';
        this.vault.put(device);
        this.emit('device.suspended', { deviceId });
        return device;
    }
    /** PSK lookup used by the channel's TLS layer, keyed by client identity. */
    pskForIdentity(identity) {
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
    isOfferIdentity(identity) {
        return this.liveOffer(identity) !== undefined;
    }
    /**
     * In-band code check for fallback channels whose TLS layer cannot carry the
     * code (certificate mode): the claim must present the offer code itself.
     */
    verifyOfferCode(offerId, code) {
        const offer = this.liveOffer(offerId);
        if (!offer || offer.phase !== 'open')
            return false;
        return normalizeCode(String(code ?? '')) === offer.code;
    }
    liveOffer(offerId) {
        const offer = this.offers.get(offerId);
        if (!offer)
            return undefined;
        if (offer.phase !== 'enrolled' && offer.phase !== 'closed' && this.now() >= offer.expiresAt) {
            offer.phase = 'closed';
            this.emit('offer.expired', { offerId });
        }
        return offer.phase === 'closed' ? undefined : offer;
    }
}
export class GateError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'GateError';
    }
}
function sanitizeName(raw) {
    const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
    return (name || 'unnamed device').slice(0, 64);
}
//# sourceMappingURL=gate.js.map