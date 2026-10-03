import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectorEntity } from 'src/modules/electors/domain/entities/elector.entity';
import type { ElectorRepository } from 'src/modules/electors/domain/repositories/elector.repository.interface';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import {
  ElectionEntity,
  type ElectionStatus,
} from 'src/modules/elections/domain/entities/election.entity';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import { ElectionNotRegisterableError } from '../../domain/errors/election-not-registerable.error';
import { ElectoralRollEntity } from '../../domain/entities/electoral-roll.entity';
import type { ElectoralRollRepository } from '../../domain/repositories/electoral-roll.repository.interface';
import { ElectoralRollRegistrationService } from './electoral-roll-registration.service';

function makeElectionRepo(election: ElectionEntity | null): ElectionRepository {
  return {
    findById: jest.fn().mockResolvedValue(election),
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findStatusHistory: jest.fn(),
    hasCandidates: jest.fn(),
    hasVotes: jest.fn(),
    hasElectoralRoll: jest.fn(),
    findExpiredActive: jest.fn(),
    delete: jest.fn(),
    updateStatus: jest.fn().mockResolvedValue(election),
  };
}

function makeElectorRepo(electors: ElectorEntity[]): ElectorRepository {
  return {
    create: jest.fn(),
    findByStudentCodeOrEmail: jest.fn(),
    findById: jest.fn(),
    softDelete: jest.fn(),
    updateStatus: jest.fn(),
    update: jest.fn(),
    findByEmail: jest.fn(),
    search: jest.fn(),
    findByStudentCodeAndProgramCode: jest.fn().mockResolvedValue(electors),
    findElectionParticipation: jest.fn(),
  };
}

function makeElectoralRollRepo(
  existingRolls: ElectoralRollEntity[] = [],
  createdCount = 0,
): ElectoralRollRepository {
  return {
    findByElectionAndElectorIds: jest.fn().mockResolvedValue(existingRolls),
    createMany: jest.fn().mockResolvedValue(createdCount),
    countByElection: jest.fn(),
    deleteByElectionAndElectorId: jest.fn(),
  };
}

function makeAudit(): AuditLogPort {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

function buildElection(status: ElectionStatus): ElectionEntity {
  return ElectionEntity.restore({
    id: 'election-uuid',
    name: 'Test Election',
    description: 'desc',
    startDate: new Date(),
    startTime: new Date(),
    endDate: new Date(),
    endTime: new Date(),
    currentStatus: status,
    blankVoteEnabled: false,
    createdAt: new Date(),
  });
}

function buildElector(studentCode: string, programCode: string, status = 'ACTIVE'): ElectorEntity {
  return ElectorEntity.restore({
    id: `elector-${studentCode}`,
    firstName: 'John',
    lastName: 'Doe',
    email: `${studentCode}@test.com`,
    passwordHash: 'hash',
    studentCode,
    programCode,
    status,
    createdAt: new Date(),
  });
}

function buildExistingRoll(electorId: string): ElectoralRollEntity {
  return ElectoralRollEntity.restore({
    id: 'roll-uuid',
    electionId: 'election-uuid',
    electorId,
    hasVoted: false,
    voteAttempts: 0,
    lastVoteAttempt: null,
    lastVoteCandidacyId: null,
    lastVoteIdempotencyKey: null,
    lastVoteRegisteredAt: null,
    createdAt: new Date(),
  });
}

const baseInput = {
  electionId: 'election-uuid',
  rows: [{ studentCode: '12345678', programCode: '1234' }],
  requestingUserId: 'user-uuid',
  auditAction: 'MANUAL_REGISTER_ELECTORAL_ROLL',
};

describe('ElectoralRollRegistrationService', () => {
  describe('empty input', () => {
    it('should return zero counts for empty rows without querying the election or auditing', async () => {
      const electionRepo = makeElectionRepo(null);
      const audit = makeAudit();
      const service = new ElectoralRollRegistrationService(
        electionRepo,
        makeElectorRepo([]),
        makeElectoralRollRepo(),
        audit,
      );

      const result = await service.registerPairs({ ...baseInput, rows: [] });

      expect(result).toEqual({
        totalRows: 0,
        registered: 0,
        alreadyRegistered: 0,
        notFound: 0,
        invalidRows: 0,
        errors: [],
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(electionRepo.findById).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('election validation', () => {
    it('should throw ElectionNotFoundError for a nonexistent election', async () => {
      const service = new ElectoralRollRegistrationService(
        makeElectionRepo(null),
        makeElectorRepo([]),
        makeElectoralRollRepo(),
        makeAudit(),
      );

      await expect(service.registerPairs(baseInput)).rejects.toThrow(ElectionNotFoundError);
    });

    it('should accept a PENDING election', async () => {
      const elector = buildElector('12345678', '1234');
      const service = new ElectoralRollRegistrationService(
        makeElectionRepo(buildElection('PENDING')),
        makeElectorRepo([elector]),
        makeElectoralRollRepo([], 1),
        makeAudit(),
      );

      const result = await service.registerPairs(baseInput);
      expect(result.registered).toBe(1);
    });

    it.each(['CREATED', 'PUBLISHED', 'ACTIVE', 'CLOSED'] as const)(
      'should throw ElectionNotRegisterableError for a %s election',
      async (status) => {
        const service = new ElectoralRollRegistrationService(
          makeElectionRepo(buildElection(status)),
          makeElectorRepo([]),
          makeElectoralRollRepo(),
          makeAudit(),
        );

        await expect(service.registerPairs(baseInput)).rejects.toThrow(
          ElectionNotRegisterableError,
        );
      },
    );
  });

  describe('no implicit status transition', () => {
    // The PENDING -> CREATED edge is an explicit administrative action
    // (FinalizeElectionUseCase). Loading the roll must never change the election's
    // lifecycle state, so no lifecycle write happens here at all.
    it('T1: does not change the election status when electors are registered', async () => {
      const elector = buildElector('12345678', '1234');
      const electionRepo = makeElectionRepo(buildElection('PENDING'));
      const service = new ElectoralRollRegistrationService(
        electionRepo,
        makeElectorRepo([elector]),
        makeElectoralRollRepo([], 1),
        makeAudit(),
      );

      const result = await service.registerPairs(baseInput);

      expect(result.registered).toBe(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(electionRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('T2: never audits ELECTION_STATUS_CHANGED', async () => {
      const elector = buildElector('12345678', '1234');
      const audit = makeAudit();
      const service = new ElectoralRollRegistrationService(
        makeElectionRepo(buildElection('PENDING')),
        makeElectorRepo([elector]),
        makeElectoralRollRepo([], 1),
        audit,
      );

      await service.registerPairs(baseInput);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(audit.log).not.toHaveBeenCalledWith(
        'ELECTION_STATUS_CHANGED',
        'user-uuid',
        expect.anything(),
      );
      // The registration's own audit entry is still written.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(audit.log).toHaveBeenCalledWith(
        'MANUAL_REGISTER_ELECTORAL_ROLL',
        'user-uuid',
        expect.objectContaining({ electionId: 'election-uuid', registered: 1 }),
      );
    });

    it('T3: leaves the election in PENDING for a fully-registered roll (no auto-finalize)', async () => {
      const elector = buildElector('12345678', '1234');
      const electionRepo = makeElectionRepo(buildElection('PENDING'));
      const service = new ElectoralRollRegistrationService(
        electionRepo,
        makeElectorRepo([elector]),
        makeElectoralRollRepo([], 1),
        makeAudit(),
      );

      await service.registerPairs(baseInput);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(electionRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('T4: performs no lifecycle write when registered is 0', async () => {
      const electionRepo = makeElectionRepo(buildElection('PENDING'));
      const service = new ElectoralRollRegistrationService(
        electionRepo,
        makeElectorRepo([]),
        makeElectoralRollRepo(),
        makeAudit(),
      );

      const result = await service.registerPairs(baseInput);

      expect(result.registered).toBe(0);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(electionRepo.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('elector matching', () => {
    it('should count unmatched rows as notFound', async () => {
      const service = new ElectoralRollRegistrationService(
        makeElectionRepo(buildElection('PENDING')),
        makeElectorRepo([]),
        makeElectoralRollRepo(),
        makeAudit(),
      );

      const result = await service.registerPairs({
        ...baseInput,
        rows: [
          { studentCode: '12345678', programCode: '1234' },
          { studentCode: '99999999', programCode: '9999' },
        ],
      });

      expect(result.notFound).toBe(2);
      expect(result.errors).toHaveLength(2);
    });

    it('should exclude inactive electors', async () => {
      const inactiveElector = buildElector('12345678', '1234', 'INACTIVE');
      const service = new ElectoralRollRegistrationService(
        makeElectionRepo(buildElection('PENDING')),
        makeElectorRepo([inactiveElector]),
        makeElectoralRollRepo(),
        makeAudit(),
      );

      const result = await service.registerPairs(baseInput);

      expect(result.invalidRows).toBe(1);
      expect(result.registered).toBe(0);
      expect(result.errors[0].reason).toBe('Elector is not active.');
    });

    it('should register active electors', async () => {
      const elector = buildElector('12345678', '1234');
      const service = new ElectoralRollRegistrationService(
        makeElectionRepo(buildElection('PENDING')),
        makeElectorRepo([elector]),
        makeElectoralRollRepo([], 1),
        makeAudit(),
      );

      const result = await service.registerPairs(baseInput);

      expect(result.registered).toBe(1);
      expect(result.alreadyRegistered).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should never create or search electors by other means', async () => {
      const elector = buildElector('12345678', '1234');
      const electorRepo = makeElectorRepo([elector]);
      const service = new ElectoralRollRegistrationService(
        makeElectionRepo(buildElection('PENDING')),
        electorRepo,
        makeElectoralRollRepo([], 1),
        makeAudit(),
      );

      await service.registerPairs(baseInput);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(electorRepo.create).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(electorRepo.findByStudentCodeOrEmail).not.toHaveBeenCalled();
    });
  });

  describe('already registered', () => {
    it('should count already-registered electors', async () => {
      const elector = buildElector('12345678', '1234');
      const service = new ElectoralRollRegistrationService(
        makeElectionRepo(buildElection('PENDING')),
        makeElectorRepo([elector]),
        makeElectoralRollRepo([buildExistingRoll(elector.id as string)]),
        makeAudit(),
      );

      const result = await service.registerPairs(baseInput);

      expect(result.alreadyRegistered).toBe(1);
      expect(result.registered).toBe(0);
    });
  });

  describe('deduplication', () => {
    it('should deduplicate identical input pairs', async () => {
      const elector = buildElector('12345678', '1234');
      const electoralRollRepo = makeElectoralRollRepo([], 1);
      const service = new ElectoralRollRegistrationService(
        makeElectionRepo(buildElection('PENDING')),
        makeElectorRepo([elector]),
        electoralRollRepo,
        makeAudit(),
      );

      const result = await service.registerPairs({
        ...baseInput,
        rows: [
          { studentCode: '12345678', programCode: '1234' },
          { studentCode: '12345678', programCode: '1234' },
          { studentCode: '12345678', programCode: '1234' },
        ],
      });

      expect(result.totalRows).toBe(3);
      expect(result.registered).toBe(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(electoralRollRepo.createMany).toHaveBeenCalledWith('election-uuid', [elector.id]);
    });

    it('should report an error only once per unique unmatched pair', async () => {
      const service = new ElectoralRollRegistrationService(
        makeElectionRepo(buildElection('PENDING')),
        makeElectorRepo([]),
        makeElectoralRollRepo(),
        makeAudit(),
      );

      const result = await service.registerPairs({
        ...baseInput,
        rows: [
          { studentCode: '99999999', programCode: '9999' },
          { studentCode: '99999999', programCode: '9999' },
        ],
      });

      expect(result.notFound).toBe(1);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('error row semantics', () => {
    it('should report the 1-based position of each unique pair', async () => {
      const service = new ElectoralRollRegistrationService(
        makeElectionRepo(buildElection('PENDING')),
        makeElectorRepo([]),
        makeElectoralRollRepo(),
        makeAudit(),
      );

      const result = await service.registerPairs({
        ...baseInput,
        rows: [
          { studentCode: '11111111', programCode: '1111' },
          { studentCode: '11111111', programCode: '1111' },
          { studentCode: '33333333', programCode: '3333' },
        ],
      });

      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].row).toBe(1);
      expect(result.errors[1].row).toBe(3);
    });
  });

  describe('idempotency', () => {
    it('should handle re-registering the same pair gracefully', async () => {
      const elector = buildElector('12345678', '1234');
      const service = new ElectoralRollRegistrationService(
        makeElectionRepo(buildElection('PENDING')),
        makeElectorRepo([elector]),
        makeElectoralRollRepo([buildExistingRoll(elector.id as string)]),
        makeAudit(),
      );

      const result = await service.registerPairs(baseInput);

      expect(result.alreadyRegistered).toBe(1);
      expect(result.registered).toBe(0);
    });
  });

  describe('audit logging', () => {
    it('should log the registration event with the provided action', async () => {
      const audit = makeAudit();
      const elector = buildElector('12345678', '1234');
      const service = new ElectoralRollRegistrationService(
        makeElectionRepo(buildElection('PENDING')),
        makeElectorRepo([elector]),
        makeElectoralRollRepo([], 1),
        audit,
      );

      await service.registerPairs(baseInput);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(audit.log).toHaveBeenCalledWith(
        'MANUAL_REGISTER_ELECTORAL_ROLL',
        'user-uuid',
        expect.objectContaining({
          electionId: 'election-uuid',
          totalRows: 1,
          registered: 1,
          alreadyRegistered: 0,
          notFound: 0,
          invalidRows: 0,
        }),
      );
    });

    it('should honor the bulk action name', async () => {
      const audit = makeAudit();
      const elector = buildElector('12345678', '1234');
      const service = new ElectoralRollRegistrationService(
        makeElectionRepo(buildElection('PENDING')),
        makeElectorRepo([elector]),
        makeElectoralRollRepo([], 1),
        audit,
      );

      await service.registerPairs({ ...baseInput, auditAction: 'BULK_REGISTER_ELECTORAL_ROLL' });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(audit.log).toHaveBeenCalledWith(
        'BULK_REGISTER_ELECTORAL_ROLL',
        'user-uuid',
        expect.any(Object),
      );
    });
  });

  describe('mixed results', () => {
    it('should return accurate counts for a mix of matched, not-found, inactive, and already-registered', async () => {
      const activeElector1 = buildElector('11111111', '1111');
      const activeElector2 = buildElector('22222222', '2222');
      const inactiveElector = buildElector('33333333', '3333', 'INACTIVE');
      const service = new ElectoralRollRegistrationService(
        makeElectionRepo(buildElection('PENDING')),
        makeElectorRepo([activeElector1, activeElector2, inactiveElector]),
        makeElectoralRollRepo([buildExistingRoll(activeElector2.id as string)], 1),
        makeAudit(),
      );

      const result = await service.registerPairs({
        ...baseInput,
        rows: [
          { studentCode: '11111111', programCode: '1111' }, // new, active
          { studentCode: '22222222', programCode: '2222' }, // already registered
          { studentCode: '33333333', programCode: '3333' }, // inactive
          { studentCode: '44444444', programCode: '4444' }, // not found
        ],
      });

      expect(result.totalRows).toBe(4);
      expect(result.registered).toBe(1);
      expect(result.alreadyRegistered).toBe(1);
      expect(result.notFound).toBe(1);
      expect(result.invalidRows).toBe(1);
    });
  });
});
