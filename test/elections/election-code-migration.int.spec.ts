import { PrismaService } from '../../src/shared/database/prisma.service';

describe('election_code migration SQL', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('backfills deterministic per-period codes and seeds counters', async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`
        CREATE TEMP TABLE migration_elections (
          id uuid PRIMARY KEY,
          created_at timestamp(3) NOT NULL,
          election_code varchar(20)
        ) ON COMMIT DROP
      `);

      await tx.$executeRawUnsafe(`
        INSERT INTO migration_elections (id, created_at) VALUES
          ('00000000-0000-0000-0000-000000000001', '2026-10-20T10:00:00Z'),
          ('00000000-0000-0000-0000-000000000002', '2026-10-01T10:00:00Z'),
          ('00000000-0000-0000-0000-000000000003', '2026-10-01T10:00:00Z'),
          ('00000000-0000-0000-0000-000000000004', '2026-11-05T10:00:00Z')
      `);

      await tx.$executeRawUnsafe(`
        WITH ranked AS (
          SELECT
            id,
            'ELECTION-'
              || to_char(created_at, 'MMYYYY')
              || '-'
              || lpad(
                   row_number() OVER (
                     PARTITION BY to_char(created_at, 'MMYYYY')
                     ORDER BY created_at ASC, id ASC
                   )::text,
                   4,
                   '0'
                 ) AS code
          FROM migration_elections
        )
        UPDATE migration_elections e
        SET election_code = r.code
        FROM ranked r
        WHERE e.id = r.id
      `);

      const rows = await tx.$queryRawUnsafe<Array<{ id: string; election_code: string }>>(
        'SELECT id, election_code FROM migration_elections ORDER BY id',
      );

      expect(rows).toEqual([
        { id: '00000000-0000-0000-0000-000000000001', election_code: 'ELECTION-102026-0003' },
        { id: '00000000-0000-0000-0000-000000000002', election_code: 'ELECTION-102026-0001' },
        { id: '00000000-0000-0000-0000-000000000003', election_code: 'ELECTION-102026-0002' },
        { id: '00000000-0000-0000-0000-000000000004', election_code: 'ELECTION-112026-0001' },
      ]);

      await tx.$executeRawUnsafe(`
        CREATE TEMP TABLE migration_counters (
          period char(6) PRIMARY KEY,
          last_value integer NOT NULL
        ) ON COMMIT DROP
      `);
      await tx.$executeRawUnsafe(`
        INSERT INTO migration_counters (period, last_value)
        SELECT
          substring(election_code from 10 for 6),
          max(substring(election_code from 17 for 4)::int)
        FROM migration_elections
        GROUP BY 1
      `);

      const counters = await tx.$queryRawUnsafe<Array<{ period: string; last_value: number }>>(
        'SELECT period, last_value FROM migration_counters ORDER BY period',
      );

      expect(counters).toEqual([
        { period: '102026', last_value: 3 },
        { period: '112026', last_value: 1 },
      ]);
    });
  });

  it('detects periods with more than 9999 rows before backfilling', async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`
        CREATE TEMP TABLE overflow_elections (
          created_at timestamp(3) NOT NULL
        ) ON COMMIT DROP
      `);
      await tx.$executeRawUnsafe(`
        INSERT INTO overflow_elections (created_at)
        SELECT '2026-10-01T00:00:00Z'::timestamp(3)
        FROM generate_series(1, 10000)
      `);

      const overflowing = await tx.$queryRawUnsafe<Array<{ period: string }>>(`
        SELECT to_char(created_at, 'MMYYYY') AS period
        FROM overflow_elections
        GROUP BY 1
        HAVING COUNT(*) > 9999
        LIMIT 1
      `);

      expect(overflowing).toEqual([{ period: '102026' }]);
    });
  });
});
