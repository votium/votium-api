// Runs the real shell script. Lives in the integration project because it is an end-to-end process
// test, not a unit test (no Jest module mocking involved).
import { execFileSync, spawnSync } from 'child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const SCRIPT = resolve(__dirname, '../../scripts/generate-election-key.sh');

describe('scripts/generate-election-key.sh', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'votium-keygen-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const mode = (path: string) => statSync(path).mode & 0o777;

  it('creates the key as 32 random bytes in base64, mode 0600, inside a 0700 directory', () => {
    const target = join(root, 'secrets', 'election_key_enc');
    execFileSync('bash', [SCRIPT, target]);

    expect(mode(join(root, 'secrets'))).toBe(0o700);
    expect(mode(target)).toBe(0o600);
    const decoded = Buffer.from(readFileSync(target, 'utf8').trim(), 'base64');
    expect(decoded).toHaveLength(32);
  });

  it('generates a different key each time', () => {
    const a = join(root, 'a');
    const b = join(root, 'b');
    execFileSync('bash', [SCRIPT, a]);
    execFileSync('bash', [SCRIPT, b]);
    expect(readFileSync(a, 'utf8')).not.toBe(readFileSync(b, 'utf8'));
  });

  it('refuses to overwrite an existing key and leaves it untouched', () => {
    const target = join(root, 'election_key_enc');
    writeFileSync(target, 'EXISTING-KEY-MATERIAL\n', { mode: 0o600 });

    const result = spawnSync('bash', [SCRIPT, target], { encoding: 'utf8' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Refusing to overwrite');
    expect(readFileSync(target, 'utf8')).toBe('EXISTING-KEY-MATERIAL\n');
  });

  it('leaves no temporary files behind', () => {
    const dir = join(root, 'secrets');
    execFileSync('bash', [SCRIPT, join(dir, 'election_key_enc')]);
    expect(readdirSync(dir)).toEqual(['election_key_enc']);
  });
});
