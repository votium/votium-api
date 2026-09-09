import { Logger } from '@nestjs/common';
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
    hasCandidates: jest.fn(),
    hasVotes: jest.fn(),
    delete: jest.fn(),
    updateStatus: jest.fn().mockResolvedValue(election),
  };
}

function makeElectorRepo(electors: ElectorEntity[]): ElectorRepository {
  return {
    create: jest.fn(),
    findByStudentCodeOrEmail: jest.fn(),
    findById: jest.fn(),
    updateStatus: jest.fn(),
    findByEmail: jest.fn(),
    search: jest.fn(),
    findByStudentCodeAndProgramCode: jest.fn().mockResolvedValue(electors),
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

    it.each(['CREATED', 'PENDING'] as const)('should accept a %s election', async (status) => {
      const elector = buildElector('12345678', '1234');
      const service = new ElectoralRollRegistrationService(
        makeElectionRepo(buildElection(status)),
        makeElectorRepo([elector]),
        makeElectoralRollRepo([], 1),
        makeAudit(),
      );

      const result = await service.registerPairs(baseInput);
      expect(result.registered).toBe(1);
    });

    it.each(['PUBLISHED', 'ACTIVE', 'CLOSED'] as const)(
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

  describe('status transition (PENDING rule)', () => {
    it('T1: calls updateStatus with PENDING when a CREATED election registers electors', async () => {
      const elector = buildElector('12345678', '1234');
      const electionRepo = makeElectionRepo(buildElection('CREATED'));
      const service = new ElectoralRollRegistrationService(
        electionRepo,
        makeElectorRepo([elector]),
        makeElectoralRollRepo([], 1),
        makeAudit(),
      );

      const result = await service.registerPairs(baseInput);

      expect(result.registered).toBe(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(electionRepo.updateStatus).toHaveBeenCalledWith(
        'election-uuid',
        'PENDING',
        'user-uuid',
      );
    });

    it('T2: audits ELECTION_STATUS_CHANGED when transitioning to PENDING', async () => {
      const elector = buildElector('12345678', '1234');
      const audit = makeAudit();
      const service = new ElectoralRollRegistrationService(
        makeElectionRepo(buildElection('CREATED')),
        makeElectorRepo([elector]),
        makeElectoralRollRepo([], 1),
        audit,
      );

      await service.registerPairs(baseInput);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(audit.log).toHaveBeenCalledWith(
        'ELECTION_STATUS_CHANGED',
        'user-uuid',
        expect.objectContaining({ electionId: 'election-uuid', newStatus: 'PENDING' }),
      );
    });

    it('T3: does not call updateStatus for a PENDING election', async () => {
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

    it('T4: does not transition (updateStatus/audit) when registered is 0 on a CREATED election', async () => {
      const elector = buildElector('12345678', '1234');
      const electionRepo = makeElectionRepo(buildElection('CREATED'));
      const audit = makeAudit();
      const service = new ElectoralRollRegistrationService(
        electionRepo,
        makeElectorRepo([elector]),
        makeElectoralRollRepo([buildExistingRoll(elector.id as string)], 0),
        audit,
      );

      await service.registerPairs(baseInput);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(electionRepo.updateStatus).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(audit.log).not.toHaveBeenCalledWith('ELECTION_STATUS_CHANGED', expect.anything());
    });

    it('T5: does not call updateStatus when registered is 0 on a PENDING election', async () => {
      const elector = buildElector('12345678', '1234');
      const electionRepo = makeElectionRepo(buildElection('PENDING'));
      const service = new ElectoralRollRegistrationService(
        electionRepo,
        makeElectorRepo([elector]),
        makeElectoralRollRepo([buildExistingRoll(elector.id as string)], 0),
        makeAudit(),
      );

      await service.registerPairs(baseInput);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(electionRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('T6: tolerates updateStatus resolving null (race) by logging a warning and succeeding', async () => {
      const elector = buildElector('12345678', '1234');
      const electionRepo = makeElectionRepo(buildElection('CREATED'));
      (electionRepo.updateStatus as jest.Mock).mockResolvedValue(null);
      const audit = makeAudit();
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const service = new ElectoralRollRegistrationService(
        electionRepo,
        makeElectorRepo([elector]),
        makeElectoralRollRepo([], 1),
        audit,
      );

      try {
        const result = await service.registerPairs(baseInput);

        expect(result.registered).toBe(1);
        expect(warnSpy).toHaveBeenCalled();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(audit.log).not.toHaveBeenCalledWith(
          'ELECTION_STATUS_CHANGED',
          'user-uuid',
          expect.objectContaining({ newStatus: 'PENDING' }),
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('T7: does not audit ELECTION_STATUS_CHANGED for a PENDING election', async () => {
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
        expect.objectContaining({ newStatus: 'PENDING' }),
      );
    });
  });

  describe('elector matching', () => {
    it('should count unmatched rows as notFound', async () => {
      const service = new ElectoralRollRegistrationService(
        makeElectionRepo(buildElection('CREATED')),
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
        makeElectionRepo(buildElection('CREATED')),
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
        makeElectionRepo(buildElection('CREATED')),
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
        makeElectionRepo(buildElection('CREATED')),
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
        makeElectionRepo(buildElection('CREATED')),
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
        makeElectionRepo(buildElection('CREATED')),
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
        makeElectionRepo(buildElection('CREATED')),
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
        makeElectionRepo(buildElection('CREATED')),
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
        makeElectionRepo(buildElection('CREATED')),
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
        makeElectionRepo(buildElection('CREATED')),
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
        makeElectionRepo(buildElection('CREATED')),
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
        makeElectionRepo(buildElection('CREATED')),
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
