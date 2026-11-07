import { createPrivateKey, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FabricConfigError } from '../errors/fabric-config.error';

export interface FabricCredentials {
  mspId: string;
  channel: string;
  endpoint: string;
  chaincodes: string[];
  identity: { certificate: Buffer; privateKey: Buffer; expiresAt: Date };
  tls: { cert: Buffer; key: Buffer; peerCa: Buffer; expiresAt: Date };
}

type Json = Record<string, unknown>;

function readJson(dir: string, name: string): Json {
  let raw: string;
  try {
    raw = readFileSync(join(dir, name), 'utf8');
  } catch {
    throw new FabricConfigError(`Cannot read ${name} in ${dir}`);
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed as Json;
  } catch {
    throw new FabricConfigError(`${name} is not a valid JSON object`);
  }
}

// Manual checks on purpose: Joi echoes the failing value in its messages, which would leak keys into logs.
function str(obj: Json, key: string, file: string, pem = false): string {
  const v = obj[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new FabricConfigError(`${file}: field "${key}" is missing or not a string`);
  }
  if (pem && !v.includes('-----BEGIN ')) {
    throw new FabricConfigError(`${file}: field "${key}" is not PEM`);
  }
  return v;
}

function parseCert(pem: string, label: string): X509Certificate {
  try {
    return new X509Certificate(pem);
  } catch {
    throw new FabricConfigError(`${label} is not a valid X.509 certificate`);
  }
}

function assertValidNow(cert: X509Certificate, label: string): Date {
  const now = Date.now();
  const from = Date.parse(cert.validFrom);
  const to = Date.parse(cert.validTo);
  if (now < from) throw new FabricConfigError(`${label} is not valid yet`);
  if (now > to) throw new FabricConfigError(`${label} expired on ${new Date(to).toISOString()}`);
  return new Date(to);
}

function assertKeyMatches(cert: X509Certificate, keyPem: string, label: string): void {
  let ok = false;
  try {
    ok = cert.checkPrivateKey(createPrivateKey(keyPem));
  } catch {
    ok = false;
  }
  if (!ok) throw new FabricConfigError(`${label}: the private key does not match the certificate`);
}

export function loadCredentials(dir: string): FabricCredentials {
  const identityJson = readJson(dir, 'api-identity.json');
  const tlsJson = readJson(dir, 'client-tls.json');
  const connJson = readJson(dir, 'connection.json');

  const mspId = str(identityJson, 'mspId', 'api-identity.json');
  const certificate = str(identityJson, 'certificate', 'api-identity.json', true);
  const privateKey = str(identityJson, 'privateKey', 'api-identity.json', true);
  const tlsCert = str(tlsJson, 'cert', 'client-tls.json', true);
  const tlsKey = str(tlsJson, 'key', 'client-tls.json', true);
  const peerCa = str(tlsJson, 'peerTlsCa', 'client-tls.json', true);

  const endpoint = str(connJson, 'endpoint', 'connection.json');
  const channel = str(connJson, 'channel', 'connection.json');
  const connMsp = str(connJson, 'mspId', 'connection.json');
  const chaincodes = connJson.chaincodes;
  if (
    !Array.isArray(chaincodes) ||
    chaincodes.length === 0 ||
    chaincodes.some((c) => typeof c !== 'string')
  ) {
    throw new FabricConfigError(
      'connection.json: field "chaincodes" must be a non-empty array of strings',
    );
  }
  if (!/^[A-Za-z0-9.-]+:\d{2,5}$/.test(endpoint)) {
    throw new FabricConfigError('connection.json: field "endpoint" must be host:port');
  }
  if (connMsp !== mspId) {
    throw new FabricConfigError('api-identity.json and connection.json disagree on mspId');
  }

  const idCert = parseCert(certificate, 'Identity certificate');
  const idExpires = assertValidNow(idCert, 'Identity certificate');
  assertKeyMatches(idCert, privateKey, 'Identity');

  const clientCert = parseCert(tlsCert, 'TLS client certificate');
  const tlsExpires = assertValidNow(clientCert, 'TLS client certificate');
  assertKeyMatches(clientCert, tlsKey, 'TLS client');
  parseCert(peerCa, 'Peer TLS CA');

  return {
    mspId,
    channel,
    endpoint,
    chaincodes: chaincodes as string[],
    identity: {
      certificate: Buffer.from(certificate),
      privateKey: Buffer.from(privateKey),
      expiresAt: idExpires,
    },
    tls: {
      cert: Buffer.from(tlsCert),
      key: Buffer.from(tlsKey),
      peerCa: Buffer.from(peerCa),
      expiresAt: tlsExpires,
    },
  };
}
