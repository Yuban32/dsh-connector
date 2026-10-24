import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeJsonFileAtomic } from '../storage/json-file.js';
const HOST_KEY_FILE = 'host-key.json';
/** Fingerprint over the raw 32-byte Ed25519 public key. */
export function publicKeyFp(publicKeyPem) {
    const digest = createHash('sha256').update(extractRawPublicKey(publicKeyPem)).digest('base64url');
    return `ed25519:${digest}`;
}
function extractRawPublicKey(publicKeyPem) {
    // SPKI DER for Ed25519 is a fixed 12-byte header followed by the raw key.
    const der = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
    return Buffer.from(der.subarray(der.length - 32));
}
function generate() {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const publicFp = publicKeyFp(publicKeyPem);
    return {
        v: 1,
        keyId: publicFp.slice('ed25519:'.length, 'ed25519:'.length + 12),
        publicKeyPem,
        privateKeyPem,
        publicFp,
        createdAt: new Date().toISOString(),
    };
}
/**
 * Load the host key pair from `dir`, creating it on first use. The private key
 * currently sits in the profile's own data directory; at-rest encryption is a
 * planned hardening step behind this same file boundary.
 */
export function loadOrCreateHostKeys(dir) {
    const file = join(dir, HOST_KEY_FILE);
    const existing = safeRead(file);
    if (existing)
        return existing;
    const created = generate();
    // Atomic write with EPERM retry — a fresh key file is exactly what
    // real-time scanners grab first, and a throw here would kill activation.
    writeJsonFileAtomic(file, created, 2);
    return created;
}
function safeRead(file) {
    try {
        const parsed = JSON.parse(readFileSync(file, 'utf8'));
        if (parsed?.v === 1 && parsed.publicFp && parsed.privateKeyPem)
            return parsed;
    }
    catch {
        // Missing or unreadable key file: fall through to creation.
    }
    return undefined;
}
//# sourceMappingURL=host-keys.js.map