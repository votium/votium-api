import { PrismaService } from '../../src/shared/database/prisma.service';
import { ElectionEntity } from '../../src/modules/elections/domain/entities/election.entity';
import { PrismaElectionRepository } from '../../src/modules/elections/infrastructure/repositories/prisma-election.repository';
import { RoleName } from '../../src/modules/iam/domain/value-objects/role-name.vo';
import { UserStatus } from '../../src/modules/iam/domain/value-objects/user-status.vo';

describe('PrismaElectionRepository integration - updateStatus', () => {
  let prisma: PrismaService;
  let repository: PrismaElectionRepository;

  const suffix = Date.now();
  const usedNames: string[] = [];
  const usedUserIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaElectionRepository(prisma);
  });

  afterEach(async () => {
    if (usedNames.length > 0) {
      // History rows reference the election: delete them first, then the election.
      const elections = await prisma.election.findMany({
        where: { name: { in: usedNames } },
        select: { id: true },
      });
      const electionIds = elections.map((e) => e.id);
      if (electionIds.length > 0) {
        await prisma.electionStatusHistory.deleteMany({
          where: { election_id: { in: electionIds } },
        });
      }
      await prisma.election.deleteMany({ where: { name: { in: usedNames } } });
      usedNames.length = 0;
    }
    if (usedUserIds.length > 0) {
      await prisma.electionStatusHistory.deleteMany({
        where: { user_id: { in: usedUserIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: usedUserIds } } });
      usedUserIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function buildElection(name: string): ElectionEntity {
    return ElectionEntity.create({
      name,
      description: 'Integration test election.',
      startDate: new Date(Date.UTC(2026, 9, 1)),
      startTime: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
      endDate: new Date(Date.UTC(2026, 9, 1)),
      endTime: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
    });
  }

  async function seedElection(name: string): Promise<ElectionEntity> {
    usedNames.push(name);
    return repository.create(buildElection(name));
  }

  async function seedUser(): Promise<string> {
    const role = await prisma.role.upsert({
      where: { name: RoleName.ADMINISTRATOR.value },
      update: {},
      create: { name: RoleName.ADMINISTRATOR.value },
    });
    const user = await prisma.user.create({
      data: {
        first_name: 'History',
        last_name: 'Actor',
        email: `history-actor-${suffix}-${Math.random()}@example.com`,
        password_hash: 'pbkdf2$placeholder',
        role_id: role.id,
        status: UserStatus.ACTIVE.value,
      },
    });
    usedUserIds.push(user.id);
    return user.id;
  }

  it('IES1: changes current_status to PENDING and returns the updated entity', async () => {
    const saved = await seedElection(`IES1-${suffix}`);
    const userId = await seedUser();

    const updated = await repository.updateStatus(saved.id as string, 'PENDING', userId);

    expect(updated).not.toBeNull();
    expect(updated!.currentStatus).toBe('PENDING');
    const row = await prisma.election.findUnique({ where: { id: saved.id as string } });
    expect(row!.current_status).toBe('PENDING');
  });

  it('IES2: writes the ElectionStatusHistory row with old/new status and actor', async () => {
    const saved = await seedElection(`IES2-${suffix}`);
    const userId = await seedUser();

    await repository.updateStatus(saved.id as string, 'PENDING', userId);

    const history = await prisma.electionStatusHistory.findMany({
      where: { election_id: saved.id as string },
    });
    expect(history).toHaveLength(1);
    expect(history[0].old_status).toBe('CREATED');
    expect(history[0].new_status).toBe('PENDING');
    expect(history[0].user_id).toBe(userId);
    expect(history[0].changed_at).toBeInstanceOf(Date);
  });

  it('IES3: status and history are written atomically (no orphan on either side)', async () => {
    const saved = await seedElection(`IES3-${suffix}`);
    const userId = await seedUser();

    const updated = await repository.updateStatus(saved.id as string, 'PENDING', userId);

    const row = await prisma.election.findUnique({ where: { id: saved.id as string } });
    const history = await prisma.electionStatusHistory.findMany({
      where: { election_id: saved.id as string },
    });
    expect(updated!.currentStatus).toBe('PENDING');
    expect(row!.current_status).toBe('PENDING');
    expect(history).toHaveLength(1);

    // A nonexistent election writes nothing at all (no status, no history).
    await repository.updateStatus('00000000-0000-0000-0000-000000000000', 'PENDING', userId);
    const orphanHistory = await prisma.electionStatusHistory.findMany({
      where: { election_id: '00000000-0000-0000-0000-000000000000' },
    });
    expect(orphanHistory).toHaveLength(0);
  });

  it('IES4: returns null for a nonexistent election id', async () => {
    const userId = await seedUser();

    const updated = await repository.updateStatus(
      '00000000-0000-0000-0000-000000000000',
      'PENDING',
      userId,
    );

    expect(updated).toBeNull();
  });

  it('IES5: updates only the targeted election', async () => {
    const target = await seedElection(`IES5-A-${suffix}`);
    const other = await seedElection(`IES5-B-${suffix}`);
    const userId = await seedUser();

    const updated = await repository.updateStatus(target.id as string, 'PENDING', userId);

    expect(updated!.currentStatus).toBe('PENDING');
    const otherRow = await prisma.election.findUnique({ where: { id: other.id as string } });
    expect(otherRow!.current_status).toBe('CREATED');
    const otherHistory = await prisma.electionStatusHistory.findMany({
      where: { election_id: other.id as string },
    });
    expect(otherHistory).toHaveLength(0);
  });

  it('IES6: records two history rows with distinct old/new statuses across transitions', async () => {
    const saved = await seedElection(`IES6-${suffix}`);
    const userId = await seedUser();

    await repository.updateStatus(saved.id as string, 'PENDING', userId);
    await repository.updateStatus(saved.id as string, 'PUBLISHED', userId);

    const history = await prisma.electionStatusHistory.findMany({
      where: { election_id: saved.id as string },
      orderBy: { changed_at: 'asc' },
    });
    expect(history).toHaveLength(2);
    expect(history[0].old_status).toBe('CREATED');
    expect(history[0].new_status).toBe('PENDING');
    expect(history[1].old_status).toBe('PENDING');
    expect(history[1].new_status).toBe('PUBLISHED');
  });

  async function seedActiveElection(name: string): Promise<ElectionEntity> {
    const saved = await seedElection(name);
    await prisma.election.update({
      where: { id: saved.id as string },
      data: { current_status: 'ACTIVE' },
    });
    return saved;
  }

  it('IES7: guarded transition with system actor writes CLOSED and one history row with user_id null', async () => {
    const saved = await seedActiveElection(`IES7-${suffix}`);
    const id = saved.id as string;

    const updated = await repository.updateStatus(id, 'CLOSED', null, 'ACTIVE');

    expect(updated).not.toBeNull();
    expect(updated!.currentStatus).toBe('CLOSED');
    const row = await prisma.election.findUnique({ where: { id } });
    expect(row!.current_status).toBe('CLOSED');

    const history = await prisma.electionStatusHistory.findMany({ where: { election_id: id } });
    expect(history).toHaveLength(1);
    expect(history[0].old_status).toBe('ACTIVE');
    expect(history[0].new_status).toBe('CLOSED');
    expect(history[0].user_id).toBeNull();
    expect(history[0].changed_at).toBeInstanceOf(Date);
  });

  it('IES8: repeating the guarded call returns null with no duplicate transition or history', async () => {
    const saved = await seedActiveElection(`IES8-${suffix}`);
    const id = saved.id as string;
    await repository.updateStatus(id, 'CLOSED', null, 'ACTIVE');

    const second = await repository.updateStatus(id, 'CLOSED', null, 'ACTIVE');

    expect(second).toBeNull();
    const row = await prisma.election.findUnique({ where: { id } });
    expect(row!.current_status).toBe('CLOSED');
    const history = await prisma.electionStatusHistory.findMany({ where: { election_id: id } });
    expect(history).toHaveLength(1);
  });

  it('IES9: guarded transition from a non-expected status returns null and writes no history', async () => {
    const saved = await seedElection(`IES9-${suffix}`);
    const id = saved.id as string;
    await prisma.election.update({ where: { id }, data: { current_status: 'PENDING' } });

    const updated = await repository.updateStatus(id, 'CLOSED', null, 'ACTIVE');

    expect(updated).toBeNull();
    const row = await prisma.election.findUnique({ where: { id } });
    expect(row!.current_status).toBe('PENDING');
    const history = await prisma.electionStatusHistory.findMany({ where: { election_id: id } });
    expect(history).toHaveLength(0);
  });

  it('IES10: guarded transition on a nonexistent id returns null and writes no history', async () => {
    const id = '00000000-0000-0000-0000-000000000000';

    const updated = await repository.updateStatus(id, 'CLOSED', null, 'ACTIVE');

    expect(updated).toBeNull();
    const history = await prisma.electionStatusHistory.findMany({ where: { election_id: id } });
    expect(history).toHaveLength(0);
  });

  it('IES11: concurrent guarded transitions — exactly one wins and only one history row exists', async () => {
    const saved = await seedActiveElection(`IES11-${suffix}`);
    const id = saved.id as string;

    const [first, second] = await Promise.all([
      repository.updateStatus(id, 'CLOSED', null, 'ACTIVE'),
      repository.updateStatus(id, 'CLOSED', null, 'ACTIVE'),
    ]);

    const outcomes = [first, second];
    const winners = outcomes.filter((r) => r !== null);
    const losers = outcomes.filter((r) => r === null);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(winners[0].currentStatus).toBe('CLOSED');

    const row = await prisma.election.findUnique({ where: { id } });
    expect(row!.current_status).toBe('CLOSED');
    const history = await prisma.electionStatusHistory.findMany({ where: { election_id: id } });
    expect(history).toHaveLength(1);
    expect(history[0].old_status).toBe('ACTIVE');
    expect(history[0].new_status).toBe('CLOSED');
    expect(history[0].user_id).toBeNull();
  });
});
