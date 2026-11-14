import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { FabricError } from '../errors/fabric.error';
import { CastVoteDto, CreateElectionDto, VoterBatchDto, VotesQueryDto } from './inputs';
import { validateInput } from './validate';

const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const smallPem = generateKeyPairSync('rsa', { modulusLength: 1024 })
  .publicKey.export({ type: 'spki', format: 'pem' })
  .toString();
const hex64 = (): string => randomBytes(32).toString('hex');

const election = (over: Record<string, unknown> = {}) => ({
  electionId: 'E1',
  name: 'Rector 2026',
  startDate: '2026-11-10T08:00:00-05:00',
  endDate: '2026-11-10T18:00:00-05:00',
  signingPublicKey: publicPem,
  ...over,
});

async function fieldsOf(
  promise: Promise<unknown>,
): Promise<Array<{ field: string; rule: string }>> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(FabricError);
    expect((e as FabricError).code).toBe('VALIDATION_ERROR');
    return (e as FabricError).data!.fields as Array<{ field: string; rule: string }>;
  }
  throw new Error('expected a validation error');
}

describe('input validation', () => {
  it('accepts a valid election', async () => {
    await expect(validateInput(CreateElectionDto, election())).resolves.toBeDefined();
  });

  it.each([
    ['id with spaces', { electionId: 'a b' }, 'electionId'],
    ['id too long', { electionId: 'a'.repeat(65) }, 'electionId'],
    ['date without time zone', { startDate: '2026-11-10T08:00:00' }, 'startDate'],
    ['impossible date', { endDate: '2026-13-45T08:00:00Z' }, 'endDate'],
    ['blank name', { name: '   ' }, 'name'],
  ])('rejects %s', async (_label, over, field) => {
    const fields = await fieldsOf(validateInput(CreateElectionDto, election(over)));
    expect(fields.map((f) => f.field)).toContain(field);
  });

  it('rejects a private key, a PKCS#1-less garbage string and a key under 2048 bits', async () => {
    for (const key of [privatePem, 'not a key', smallPem]) {
      const fields = await fieldsOf(
        validateInput(CreateElectionDto, election({ signingPublicKey: key })),
      );
      expect(fields[0].field).toBe('signingPublicKey');
    }
  });

  it('never echoes values in validation errors', async () => {
    let body = '';
    try {
      await validateInput(CreateElectionDto, election({ signingPublicKey: privatePem }));
    } catch (e) {
      body = JSON.stringify((e as FabricError).toResponse());
    }
    expect(body).not.toContain('PRIVATE');
    expect(body).not.toContain('BEGIN');
  });

  it('rejects unexpected properties', async () => {
    const fields = await fieldsOf(validateInput(CreateElectionDto, election({ extra: 'x' })));
    expect(fields[0].field).toBe('extra');
  });

  it('validates voter batches: size and hash format', async () => {
    await expect(
      validateInput(VoterBatchDto, { electionId: 'E1', voterHashes: [hex64()] }),
    ).resolves.toBeDefined();
    await fieldsOf(validateInput(VoterBatchDto, { electionId: 'E1', voterHashes: [] }));
    await fieldsOf(
      validateInput(VoterBatchDto, {
        electionId: 'E1',
        voterHashes: Array.from({ length: 501 }, hex64),
      }),
    );
    await fieldsOf(
      validateInput(VoterBatchDto, { electionId: 'E1', voterHashes: ['ZZ'.repeat(32)] }),
    );
    await fieldsOf(
      validateInput(VoterBatchDto, { electionId: 'E1', voterHashes: [hex64().toUpperCase()] }),
    );
  });

  it('validates a vote: 64-hex nullifier and base64 signature', async () => {
    const ok = {
      electionId: 'E1',
      candidateId: 'C1',
      nullifier: hex64(),
      signature: randomBytes(256).toString('base64'),
    };
    await expect(validateInput(CastVoteDto, ok)).resolves.toBeDefined();
    await fieldsOf(validateInput(CastVoteDto, { ...ok, nullifier: 'abc' }));
    await fieldsOf(validateInput(CastVoteDto, { ...ok, signature: 'not base64!!' }));
  });

  it('bounds pagination', async () => {
    await expect(
      validateInput(VotesQueryDto, { electionId: 'E1', pageSize: 1000 }),
    ).resolves.toBeDefined();
    await fieldsOf(validateInput(VotesQueryDto, { electionId: 'E1', pageSize: 1001 }));
    await fieldsOf(validateInput(VotesQueryDto, { electionId: 'E1', pageSize: 0 }));
  });
});
