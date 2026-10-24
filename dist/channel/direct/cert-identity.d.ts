import 'reflect-metadata';
export interface TlsCert {
    v: 1;
    certPem: string;
    keyPem: string;
    /** `sha256-<base64url>` over the PEM — informational identifier. */
    fp: string;
    createdAt: string;
}
/**
 * Self-signed TLS certificate for the fallback channel mode.
 *
 * The primary channel authenticates via TLS-PSK (no certificate); some
 * runtimes — notably Electron's BoringSSL-backed node:tls — reject PSK
 * cipher suites outright, so this mode serves a normal self-signed cert and
 * the enrollment code moves to an in-band check (see gate.verifyOfferCode).
 * Pure node:crypto cannot mint X.509, hence @peculiar/x509 here.
 */
export declare function loadOrCreateTlsCert(dir: string, hostName: string): Promise<TlsCert>;
//# sourceMappingURL=cert-identity.d.ts.map