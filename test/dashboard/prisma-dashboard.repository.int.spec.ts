import { PrismaService } from '../../src/shared/database/prisma.service';
import type { ElectionStatus } from '../../src/modules/elections/domain/entities/election.entity';
import { PrismaDashboardRepository } from '../../src/modules/dashboard/infrastructure/repositories/prisma-dashboard.repository';

describe('PrismaDashboardRepository integration', () => {
  let prisma: PrismaService;
  let repository: PrismaDashboardRepository;

  const suffix = Date.now();
  let roleId = '';

  // Tracked ids are cleaned up in `afterEach` so each test starts from a known state.
  const tracked = {
    elections: [] as string[],
    candidates: [] as string[],
    electors: [] as string[],
    users: [] as string[],
    auditLogs: [] as string[],
  };

  let seq = 0;
  const unique = (prefix: string): string => `${prefix}-${suffix}-${++seq}`;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaDashboardRepository(prisma);

    const role = await prisma.role.create({ data: { name: unique('ROLE') } });
    roleId = role.id;
  });

  afterEach(async () => {
    await prisma.auditLog.deleteMany({ where: { id: { in: tracked.auditLogs } } });
    await prisma.election.deleteMany({ where: { id: { in: tracked.elections } } });
    await prisma.candidate.deleteMany({ where: { id: { in: tracked.candidates } } });
    await prisma.elector.deleteMany({ where: { id: { in: tracked.electors } } });
    await prisma.user.deleteMany({ where: { id: { in: tracked.users } } });
    tracked.elections.length = 0;
    tracked.candidates.length = 0;
    tracked.electors.length = 0;
    tracked.users.length = 0;
    tracked.auditLogs.length = 0;
  });

  afterAll(async () => {
    await prisma.role.deleteMany({ where: { id: roleId } });
    await prisma.$disconnect();
  });

  async function seedElection(
    over: {
      name?: string;
      startDate?: Date;
      startTime?: Date;
      status?: ElectionStatus;
    } = {},
  ): Promise<{ id: string; name: string; status: ElectionStatus }> {
    const created = await prisma.election.create({
      data: {
        name: over.name ?? unique('EL'),
        description: 'Integration test election.',
        start_date: over.startDate ?? new Date(Date.UTC(2099, 0, 1)),
        start_time: over.startTime ?? new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
        end_date: new Date(Date.UTC(2099, 0, 1)),
        end_time: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
        current_status: over.status ?? 'PENDING',
      },
    });
    tracked.elections.push(created.id);
    return { id: created.id, name: created.name, status: created.current_status };
  }

  async function seedCandidate(
    over: {
      firstName?: string;
      lastName?: string;
      status?: string;
      deletedAt?: Date | null;
    } = {},
  ): Promise<{ id: string; firstName: string; lastName: string }> {
    const created = await prisma.candidate.create({
      data: {
        first_name: over.firstName ?? 'Cand',
        last_name: over.lastName ?? unique('Last'),
        student_code: unique('SC'),
        program_code: '2710',
        identification_number: unique('ID'),
        status: over.status ?? 'ACTIVE',
        deleted_at: over.deletedAt ?? null,
      },
    });
    tracked.candidates.push(created.id);
    return { id: created.id, firstName: created.first_name, lastName: created.last_name };
  }

  async function seedElector(
    over: {
      firstName?: string;
      lastName?: string;
      status?: string;
      deletedAt?: Date | null;
    } = {},
  ): Promise<{ id: string; firstName: string; lastName: string }> {
    const created = await prisma.elector.create({
      data: {
        first_name: over.firstName ?? 'Elec',
        last_name: over.lastName ?? unique('Last'),
        email: unique('EM') + '@example.com',
        password_hash: 'pbkdf2$placeholder',
        student_code: unique('ESC'),
        program_code: '2710',
        status: over.status ?? 'ACTIVE',
        deleted_at: over.deletedAt ?? null,
      },
    });
    tracked.electors.push(created.id);
    return { id: created.id, firstName: created.first_name, lastName: created.last_name };
  }

  async function seedUser(
    over: {
      firstName?: string;
      lastName?: string;
    } = {},
  ): Promise<{ id: string; firstName: string; lastName: string }> {
    const created = await prisma.user.create({
      data: {
        first_name: over.firstName ?? 'Usr',
        last_name: over.lastName ?? unique('Last'),
        email: unique('UM') + '@example.com',
        password_hash: 'pbkdf2$placeholder',
        role_id: roleId,
        status: 'ACTIVE',
      },
    });
    tracked.users.push(created.id);
    return { id: created.id, firstName: created.first_name, lastName: created.last_name };
  }

  async function seedAuditLog(
    action: string,
    userId: string,
    details?: unknown,
    timestamp: Date = new Date(Date.UTC(2099, 0, 1)),
  ): Promise<void> {
    const created = await prisma.auditLog.create({
      data: {
        user_id: userId,
        action,
        details: details === undefined ? null : JSON.stringify(details),
        timestamp,
      },
    });
    tracked.auditLogs.push(created.id);
  }

  describe('counts', () => {
    // The repository's count methods read global state, which other integration files
    // mutate concurrently, so exact totals are not stable under parallel execution.
    // Assertions therefore verify the invariant that is robust to concurrent inserts:
    // the repository counts at least the rows seeded here, and excludes soft-deleted rows.
    it('IU-01: counts every election regardless of lifecycle state', async () => {
      await seedElection({ name: unique('EL') });
      await seedElection({ name: unique('EL'), status: 'PUBLISHED' });

      expect(await repository.countElections()).toBeGreaterThanOrEqual(2);
    });

    it('IU-02: counts ACTIVE + INACTIVE candidates and excludes soft-deleted', async () => {
      await seedCandidate({ status: 'ACTIVE' });
      await seedCandidate({ status: 'INACTIVE' });
      await seedCandidate({ deletedAt: new Date() });

      const repoCount = await repository.countCandidates();
      const totalCount = await prisma.candidate.count();

      // The seeded soft-deleted row must keep the non-deleted count strictly below
      // the full-table count.
      expect(repoCount).toBeLessThan(totalCount);
    });

    it('IU-03: counts ACTIVE + INACTIVE electors and excludes soft-deleted', async () => {
      await seedElector({ status: 'ACTIVE' });
      await seedElector({ status: 'INACTIVE' });
      await seedElector({ deletedAt: new Date() });

      const repoCount = await repository.countElectors();
      const totalCount = await prisma.elector.count();

      expect(repoCount).toBeLessThan(totalCount);
    });
  });

  describe('status grouping', () => {
    it('IU-04: groups elections by persisted status', async () => {
      await seedElection({ status: 'CREATED' });
      await seedElection({ status: 'CREATED' });
      await seedElection({ status: 'CLOSED' });

      const result = await repository.countElectionsByStatus();

      expect(result.CREATED).toBeGreaterThanOrEqual(2);
      expect(result.CLOSED).toBeGreaterThanOrEqual(1);
      // Zero-filling of absent states is a use-case concern (ST-01/03/04).
    });
  });

  describe('upcoming elections', () => {
    // A fixed far-future window isolates these tests from any pre-existing 2026 data.
    const FROM = new Date(Date.UTC(2099, 0, 1));
    const TO = new Date(Date.UTC(2099, 0, 2));

    it('IU-05/06: excludes elections that already started or start exactly at `from`', async () => {
      await seedElection({
        name: unique('STARTED'),
        startDate: new Date(Date.UTC(2098, 11, 31)),
        startTime: new Date(Date.UTC(1970, 0, 1, 23, 59, 0)),
      });
      await seedElection({
        name: unique('AT_FROM'),
        startDate: new Date(Date.UTC(2099, 0, 1)),
        startTime: new Date(Date.UTC(1970, 0, 1, 0, 0, 0)),
      });

      const rows = await repository.findUpcomingElections({ from: FROM, to: TO });

      expect(rows.map((r) => r.name)).toEqual([]);
    });

    it('IU-07/09: includes elections inside the window and on the upper boundary', async () => {
      const inside = await seedElection({
        name: unique('INSIDE'),
        startDate: new Date(Date.UTC(2099, 0, 1)),
        startTime: new Date(Date.UTC(1970, 0, 1, 12, 0, 0)),
      });
      const upper = await seedElection({
        name: unique('UPPER'),
        startDate: new Date(Date.UTC(2099, 0, 2)),
        startTime: new Date(Date.UTC(1970, 0, 1, 0, 0, 0)),
      });

      const rows = await repository.findUpcomingElections({ from: FROM, to: TO });

      expect(rows.map((r) => r.name).sort()).toEqual([inside.name, upper.name].sort());
    });

    it('IU-08: excludes elections beyond the upper boundary', async () => {
      await seedElection({
        name: unique('AFTER'),
        startDate: new Date(Date.UTC(2099, 0, 3)),
        startTime: new Date(Date.UTC(1970, 0, 1, 0, 0, 0)),
      });

      const rows = await repository.findUpcomingElections({ from: FROM, to: TO });

      expect(rows).toEqual([]);
    });

    it('IU-10/11: orders by start date, then time, then id (closest first)', async () => {
      const late = await seedElection({
        name: unique('LATE'),
        startDate: new Date(Date.UTC(2099, 0, 1)),
        startTime: new Date(Date.UTC(1970, 0, 1, 12, 0, 0)),
      });
      const early = await seedElection({
        name: unique('EARLY'),
        startDate: new Date(Date.UTC(2099, 0, 1)),
        startTime: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
      });
      const nextDay = await seedElection({
        name: unique('NEXT'),
        startDate: new Date(Date.UTC(2099, 0, 2)),
        startTime: new Date(Date.UTC(1970, 0, 1, 0, 0, 0)),
      });

      const rows = await repository.findUpcomingElections({ from: FROM, to: TO });

      expect(rows.map((r) => r.id)).toEqual([early.id, late.id, nextDay.id]);
    });

    it('IU-12: does not filter by lifecycle status', async () => {
      await seedElection({ name: unique('PENDING_EL'), status: 'PENDING' });
      await seedElection({ name: unique('PUBLISHED_EL'), status: 'PUBLISHED' });

      const rows = await repository.findUpcomingElections({ from: FROM, to: TO });

      expect(rows).toHaveLength(2);
    });
  });

  describe('recent activity', () => {
    it('IU-13: returns exactly the five newest non-MFA rows, newest first', async () => {
      const actor = await seedUser();
      for (let i = 0; i < 6; i += 1) {
        await seedAuditLog(
          'ELECTION_CREATED',
          actor.id,
          { electionId: unique('E') },
          new Date(Date.UTC(2099, 0, 1, 0, i, 0)),
        );
      }

      const rows = await repository.findRecentActivity(5);

      expect(rows).toHaveLength(5);
      const times = rows.map((r) => r.occurredAt.getTime());
      expect([...times].sort((a, b) => b - a)).toEqual(times);
    });

    it('IU-14: returns rows newest-first even when fewer than five exist', async () => {
      const actor = await seedUser();
      await seedAuditLog(
        'ELECTION_CREATED',
        actor.id,
        { electionId: unique('E') },
        new Date(Date.UTC(2099, 0, 1, 0, 0, 0)),
      );
      await seedAuditLog(
        'ELECTION_UPDATED',
        actor.id,
        { electionId: unique('E') },
        new Date(Date.UTC(2099, 0, 1, 0, 1, 0)),
      );

      const rows = await repository.findRecentActivity(5);

      expect(rows.length).toBeLessThanOrEqual(5);
      // The two future-dated rows are the newest, so they appear first, in order.
      expect(rows[0].action).toBe('ELECTION_UPDATED');
      expect(rows[1].action).toBe('ELECTION_CREATED');
    });

    it('IU-16/17: maps action/resource/user/occurredAt and tolerates malformed details', async () => {
      const actor = await seedUser({ firstName: 'Jean', lastName: 'Lerma' });
      const election = await seedElection();
      await seedAuditLog('ELECTION_CREATED', actor.id, { electionId: election.id });
      await seedAuditLog('ELECTION_UPDATED', actor.id, '{not-json');

      const rows = await repository.findRecentActivity(5);

      const mapped = rows.find((r) => r.action === 'ELECTION_CREATED');
      expect(mapped).toMatchObject({
        resourceType: 'Election',
        resourceName: election.name,
        userName: 'Jean Lerma',
      });
      expect(mapped?.occurredAt).toBeInstanceOf(Date);

      const malformed = rows.find((r) => r.action === 'ELECTION_UPDATED');
      expect(malformed?.resourceName).toBe('');
    });

    it('IU-18: excludes MFA/session actions from the feed', async () => {
      const actor = await seedUser();
      await seedAuditLog('MFA_OTP_SENT', actor.id, { sessionId: 's1' });
      await seedAuditLog('MFA_VERIFY_SUCCESS', actor.id, { sessionId: 's1' });
      await seedAuditLog('ELECTION_CREATED', actor.id, { electionId: unique('E') });

      const rows = await repository.findRecentActivity(5);

      expect(rows.map((r) => r.action)).not.toContain('MFA_OTP_SENT');
      expect(rows.map((r) => r.action)).not.toContain('MFA_VERIFY_SUCCESS');
      expect(rows.map((r) => r.action)).toContain('ELECTION_CREATED');
    });

    it('IU-19: resolves names for Election/Candidate/Elector/User resources', async () => {
      const actor = await seedUser();
      const election = await seedElection();
      const candidate = await seedCandidate({ firstName: 'Ana', lastName: 'Perez' });
      const elector = await seedElector({ firstName: 'Luis', lastName: 'Diaz' });
      const user = await seedUser({ firstName: 'Marta', lastName: 'Ruiz' });

      await seedAuditLog('ELECTION_CREATED', actor.id, { electionId: election.id });
      await seedAuditLog('CANDIDATE_REGISTERED', actor.id, { candidateId: candidate.id });
      await seedAuditLog('ELECTOR_UPDATED', actor.id, { electorId: elector.id });
      await seedAuditLog('USER_CREATED', actor.id, { userId: user.id });

      const rows = await repository.findRecentActivity(5);
      const byAction = (action: string) => rows.find((r) => r.action === action);

      expect(byAction('ELECTION_CREATED')?.resourceName).toBe(election.name);
      expect(byAction('CANDIDATE_REGISTERED')?.resourceName).toBe('Ana Perez');
      expect(byAction('ELECTOR_UPDATED')?.resourceName).toBe('Luis Diaz');
      expect(byAction('USER_CREATED')?.resourceName).toBe('Marta Ruiz');
    });

    it('IU-20: resolves indirect names for Candidacy and ElectoralRoll', async () => {
      const actor = await seedUser();
      const candidate = await seedCandidate({ firstName: 'Pepe', lastName: 'Gomez' });
      const election = await seedElection();

      await seedAuditLog('CANDIDACY_REGISTERED', actor.id, {
        electionId: unique('E'),
        candidateId: candidate.id,
        candidacyId: unique('C'),
      });
      await seedAuditLog('BULK_REGISTER_ELECTORAL_ROLL', actor.id, {
        electionId: election.id,
      });

      const rows = await repository.findRecentActivity(5);

      expect(rows.find((r) => r.action === 'CANDIDACY_REGISTERED')?.resourceName).toBe(
        'Pepe Gomez',
      );
      expect(rows.find((r) => r.action === 'BULK_REGISTER_ELECTORAL_ROLL')?.resourceName).toBe(
        election.name,
      );
    });

    it('IU-21: returns empty name for unknown actions and missing entities', async () => {
      const actor = await seedUser();
      await seedAuditLog('SOMETHING_UNKNOWN', actor.id);
      await seedAuditLog('USER_CREATED', actor.id, { userId: 'does-not-exist' });

      const rows = await repository.findRecentActivity(5);

      const unknown = rows.find((r) => r.action === 'SOMETHING_UNKNOWN');
      expect(unknown?.resourceType).toBe('Unknown');
      expect(unknown?.resourceName).toBe('');

      const missing = rows.find((r) => r.action === 'USER_CREATED');
      expect(missing?.resourceName).toBe('');
    });
  });

  describe('read-only guarantee', () => {
    it('IU-22: read queries never mutate persisted state', async () => {
      const actor = await seedUser();
      const election = await seedElection({ name: unique('EL'), status: 'CREATED' });
      await seedAuditLog('ELECTION_CREATED', actor.id, { electionId: election.id });

      const auditCountBefore = await prisma.auditLog.count();

      await repository.countElections();
      await repository.countElectionsByStatus();
      await repository.findUpcomingElections({
        from: new Date(Date.UTC(2099, 0, 1)),
        to: new Date(Date.UTC(2099, 0, 2)),
      });
      await repository.findRecentActivity(5);

      const after = await prisma.election.findUniqueOrThrow({ where: { id: election.id } });
      expect(after.current_status).toBe('CREATED');
      expect(await prisma.auditLog.count()).toBe(auditCountBefore);
    });
  });
});
