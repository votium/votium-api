import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCredentials } from './credentials.loader';

function pair(dir: string, name: string): { key: string; crt: string } {
  const key = join(dir, `${name}.key`);
  const crt = join(dir, `${name}.crt`);
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'ec',
      '-pkeyopt',
      'ec_paramgen_curve:prime256v1',
      '-nodes',
      '-keyout',
      key,
      '-out',
      crt,
      '-subj',
      `/CN=${name}`,
      '-days',
      '30',
    ],
    { stdio: 'ignore' },
  );
  return { key: readFileSync(key, 'utf8'), crt: readFileSync(crt, 'utf8') };
}

describe('loadCredentials', () => {
  let dir: string;
  let id: { key: string; crt: string };
  let tls: { key: string; crt: string };
  let other: { key: string; crt: string };

  const write = (
    o: { identityKey?: string; certificate?: string; connMsp?: string } = {},
  ): void => {
    writeFileSync(
      join(dir, 'api-identity.json'),
      JSON.stringify({
        mspId: 'Org1MSP',
        certificate: o.certificate ?? id.crt,
        privateKey: o.identityKey ?? id.key,
      }),
    );
    writeFileSync(
      join(dir, 'client-tls.json'),
      JSON.stringify({ cert: tls.crt, key: tls.key, peerTlsCa: tls.crt }),
    );
    writeFileSync(
      join(dir, 'connection.json'),
      JSON.stringify({
        endpoint: 'peer.example.com:443',
        channel: 'ch',
        mspId: o.connMsp ?? 'Org1MSP',
        chaincodes: ['elections'],
      }),
    );
  };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'fabric-creds-'));
    id = pair(dir, 'id');
    tls = pair(dir, 'tls');
    other = pair(dir, 'other');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('loads valid credentials', () => {
    write();
    const c = loadCredentials(dir);
    expect(c.mspId).toBe('Org1MSP');
    expect(c.channel).toBe('ch');
    expect(c.chaincodes).toEqual(['elections']);
  });

  it('fails when a file is missing', () => {
    rmSync(join(dir, 'connection.json'), { force: true });
    expect(() => loadCredentials(dir)).toThrow(/Cannot read connection.json/);
  });

  it('fails when the msp ids disagree', () => {
    write({ connMsp: 'Org2MSP' });
    expect(() => loadCredentials(dir)).toThrow(/disagree on mspId/);
  });

  it('fails when the private key does not match the certificate', () => {
    write({ identityKey: other.key });
    expect(() => loadCredentials(dir)).toThrow(/does not match/);
  });

  it('never puts key material in error messages', () => {
    write({ certificate: 'not a certificate' });
    let message = '';
    try {
      loadCredentials(dir);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).not.toBe('');
    expect(message).not.toContain('BEGIN');
    expect(message).not.toContain(id.key.slice(40, 80));
  });
});
