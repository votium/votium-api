import { PrismaService } from '../../src/shared/database/prisma.service';
import { ElectionEntity } from '../../src/modules/elections/domain/entities/election.entity';
import { ElectionNameConflictError } from '../../src/modules/elections/domain/errors/election-name-conflict.error';
import { PrismaElectionRepository } from '../../src/modules/elections/infrastructure/repositories/prisma-election.repository';

describe('PrismaElectionRepository integration', () => {
  let prisma: PrismaService;
  let repository: PrismaElectionRepository;

  const suffix = Date.now();
  const usedNames: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaElectionRepository(prisma);
  });

  afterEach(async () => {
    if (usedNames.length > 0) {
      await prisma.election.deleteMany({ where: { name: { in: usedNames } } });
      usedNames.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function buildEntity(name: string): ElectionEntity {
    return ElectionEntity.create({
      name,
      description: 'Integration test election.',
      startDate: new Date(Date.UTC(2026, 9, 1)),
      startTime: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
      endDate: new Date(Date.UTC(2026, 9, 1)),
      endTime: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
    });
  }

  it('persists an election and returns a Prisma-generated id and createdAt', async () => {
    const name = `INT-${suffix}`;
    usedNames.push(name);

    const saved = await repository.create(buildEntity(name));

    expect(saved.id).toBeTruthy();
    expect(saved.id).not.toBeNull();
    expect(saved.createdAt).toBeInstanceOf(Date);
  });

  it('stores all provided fields and defaults correctly', async () => {
    const name = `FIELDS-${suffix}`;
    usedNames.push(name);

    const saved = await repository.create(buildEntity(name));

    expect(saved).toEqual(
      expect.objectContaining({
        name,
        description: 'Integration test election.',
        currentStatus: 'CREATED',
        blankVoteEnabled: false,
      }),
    );
    expect(saved.startDate).toBeInstanceOf(Date);
    expect(saved.endDate).toBeInstanceOf(Date);
  });

  it('stores the date/time components correctly in the database', async () => {
    const name = `DATE-${suffix}`;
    usedNames.push(name);

    await repository.create(buildEntity(name));

    const row = await prisma.election.findUnique({ where: { name } });
    expect(row).not.toBeNull();
    expect(row!.current_status).toBe('CREATED');
    expect(row!.blank_vote_enabled).toBe(false);
    expect(row!.start_date.getUTCFullYear()).toBe(2026);
    expect(row!.start_date.getUTCMonth()).toBe(9);
    expect(row!.start_date.getUTCDate()).toBe(1);
    expect(row!.start_time.getUTCHours()).toBe(8);
    expect(row!.start_time.getUTCMinutes()).toBe(0);
  });

  it('rejects a duplicate name with ElectionNameConflictError (P2002)', async () => {
    const name = `DUP-${suffix}`;
    usedNames.push(name);

    await repository.create(buildEntity(name));

    await expect(repository.create(buildEntity(name))).rejects.toBeInstanceOf(
      ElectionNameConflictError,
    );
  });

  it('never updates the original row when a duplicate name is rejected', async () => {
    const name = `NOUPD-${suffix}`;
    usedNames.push(name);

    await repository.create(buildEntity(name));

    await expect(repository.create(buildEntity(name))).rejects.toBeInstanceOf(
      ElectionNameConflictError,
    );

    const rows = await prisma.election.findMany({ where: { name } });
    expect(rows).toHaveLength(1);
  });
});
