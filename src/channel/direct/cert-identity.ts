import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { X509CertificateGenerator, SubjectAlternativeNameExtension } from '@peculiar/x509';

import { readJsonFile, writeJsonFileAtomic } from '../../storage/json-file.js';

const CERT_FILE = 'tls-cert.json';

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
export async function loadOrCreateTlsCert(dir: string, hostName: string): Promise<TlsCert> {
  const file = join(dir, CERT_FILE);
  const existing = readJsonFile<TlsCert>(file);
  if (existing?.v === 1 && existing.certPem && existing.keyPem) return existing;

  const pair = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
  )) as unknown as Parameters<typeof X509CertificateGenerator.createSelfSigned>[0]['keys'];
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));

  const cert = await X509CertificateGenerator.createSelfSigned({
    serialNumber: '01',
    name: `CN=DS Connector ${hostName}`,
    notBefore: new Date(Date.now() - 60_000),
    notAfter: new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000),
    keys: pair,
    extensions: [
      new SubjectAlternativeNameExtension([
        { type: 'dns', value: hostName },
        { type: 'dns', value: 'localhost' },
        { type: 'ip', value: '127.0.0.1' },
      ]),
    ],
  });

  const certPem = cert.toString('pem');
  const record: TlsCert = {
    v: 1,
    certPem,
    keyPem: toPem(pkcs8, 'PRIVATE KEY'),
    fp: `sha256-${createHash('sha256').update(certPem).digest('base64url')}`,
    createdAt: new Date().toISOString(),
  };
  writeJsonFileAtomic(file, record, 2);
  return record;
}

function toPem(der: Uint8Array, label: string): string {
  const b64 = Buffer.from(der).toString('base64');
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
}
