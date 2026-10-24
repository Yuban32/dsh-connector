export interface HostKeyFile {
    v: 1;
    keyId: string;
    publicKeyPem: string;
    privateKeyPem: string;
    /** `ed25519:<base64url(sha256(raw public key))>` */
    publicFp: string;
    createdAt: string;
}
/** Fingerprint over the raw 32-byte Ed25519 public key. */
export declare function publicKeyFp(publicKeyPem: string): string;
/**
 * Load the host key pair from `dir`, creating it on first use. The private key
 * currently sits in the profile's own data directory; at-rest encryption is a
 * planned hardening step behind this same file boundary.
 */
export declare function loadOrCreateHostKeys(dir: string): HostKeyFile;
//# sourceMappingURL=host-keys.d.ts.map