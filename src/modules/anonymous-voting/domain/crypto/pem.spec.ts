import { randomBytes } from 'crypto';
import { bytesToHex, hexToBytes, pemToSpki, spkiToPem } from './pem';

describe('pem', () => {
  it('round-trips DER SPKI through PEM with 64-character lines', () => {
    const der = Uint8Array.from(randomBytes(294));
    const pem = spkiToPem(der);
    expect(pem.startsWith('-----BEGIN PUBLIC KEY-----\n')).toBe(true);
    expect(pem.trimEnd().endsWith('-----END PUBLIC KEY-----')).toBe(true);
    for (const line of pem.split('\n').slice(1, -2)) expect(line.length).toBeLessThanOrEqual(64);
    expect(Buffer.from(pemToSpki(pem))).toEqual(Buffer.from(der));
  });

  it('converts hex both ways', () => {
    expect(bytesToHex(hexToBytes('00ff10'))).toBe('00ff10');
  });
});
