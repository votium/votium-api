// Schema invariants of the anonymous-voting tables (phase 3). These guard the anonymity
// property at the database level: no link from a credential to a vote or commitment.
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../src/shared/database/prisma.service';

describe('anonymous voting schema (integration)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ providers: [PrismaService] }).compile();
    prisma = mod.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const columnsOf = async (table: string) =>
    (
      await prisma.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name FROM information_schema.columns WHERE table_name = ${table}`
    ).map((c) => c.column_name);

  const foreignKeys = async (table: string) =>
    (
      await prisma.$queryRaw<Array<{ ref: string }>>`
        SELECT ccu.table_name AS ref
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
        WHERE tc.table_name = ${table} AND tc.constraint_type = 'FOREIGN KEY'`
    ).map((r) => r.ref);

  it('anonymous_votes has no elector column and no foreign key to credentials or electors', async () => {
    const cols = await columnsOf('anonymous_votes');
    expect(cols).not.toContain('elector_id');
    expect(cols).not.toContain('credential_id');
    expect(cols).toContain('payload');
    const refs = await foreignKeys('anonymous_votes');
    expect(refs).toEqual(['elections']);
  });

  it('anonymous_commitments has no foreign key to electors', async () => {
    expect(await foreignKeys('anonymous_commitments')).toEqual(['elections']);
  });

  it('anonymous_credentials never stores a ballot identifier', async () => {
    const cols = await columnsOf('anonymous_credentials');
    expect(cols).not.toContain('ballot_id');
    expect(cols).not.toContain('ballotId');
    expect(cols.sort()).toEqual(['elector_id', 'election_id', 'id', 'issued_at'].sort());
  });

  it('no table of the anonymous flow references the credential table', async () => {
    for (const table of ['anonymous_votes', 'anonymous_commitments', 'anonymous_election_keys']) {
      expect(await foreignKeys(table)).not.toContain('anonymous_credentials');
    }
  });

  it('electoral_rolls keeps only its membership columns (additive migration, no vote state change)', async () => {
    const cols = await columnsOf('electoral_rolls');
    expect(cols.sort()).toEqual(
      [
        'created_at',
        'elector_id',
        'election_id',
        'id',
        'has_voted',
        'vote_attempts',
        'last_vote_attempt',
        'last_vote_candidacy_id',
        'last_vote_idempotency_key',
        'last_vote_registered_at',
      ].sort(),
    );
  });

  it('payload is stored as json, not jsonb', async () => {
    const [row] = await prisma.$queryRaw<Array<{ data_type: string }>>`
      SELECT data_type FROM information_schema.columns WHERE table_name = 'anonymous_votes' AND column_name = 'payload'`;
    expect(row.data_type).toBe('json');
  });
});
