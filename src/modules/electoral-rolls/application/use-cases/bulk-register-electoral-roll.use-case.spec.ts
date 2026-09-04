import { BadRequestException } from 'src/shared/exceptions/base/bad-request.exception';
import { Logger } from '@nestjs/common';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import { ElectionNotRegisterableError } from '../../domain/errors/election-not-registerable.error';
import { BulkRegisterElectoralRollUseCase } from './bulk-register-electoral-roll.use-case';
import type {
  ElectoralRollCsvParserPort,
  ElectoralRollCsvRow,
} from '../ports/electoral-roll-csv-parser.port';
import type { ElectoralRollRepository } from '../../domain/repositories/electoral-roll.repository.interface';
import type { ElectorRepository } from 'src/modules/electors/domain/repositories/elector.repository.interface';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectorEntity } from 'src/modules/electors/domain/entities/elector.entity';
import {
  ElectionEntity,
  type ElectionStatus,
} from 'src/modules/elections/domain/entities/election.entity';
import { ElectoralRollEntity } from '../../domain/entities/electoral-roll.entity';

function makeParser(rows: ElectoralRollCsvRow[]): ElectoralRollCsvParserPort {
  return { parse: jest.fn().mockReturnValue(rows) };
}

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

const baseInput = {
  electionId: 'election-uuid',
  originalName: 'padron.csv',
  buffer: Buffer.from(''),
  requestingUserId: 'user-uuid',
};

describe('BulkRegisterElectoralRollUseCase', () => {
  describe('file validation', () => {
    it('should reject non-CSV files', async () => {
      const useCase = new BulkRegisterElectoralRollUseCase(
        makeParser([]),
        makeElectionRepo(null),
        makeElectorRepo([]),
        makeElectoralRollRepo(),
        makeAudit(),
      );

      await expect(useCase.execute({ ...baseInput, originalName: 'padron.xlsx' })).rejects.toThrow(
        BadRequestException,
      );
      await expect(useCase.execute({ ...baseInput, originalName: 'padron.xlsx' })).rejects.toThrow(
        'Only CSV files are supported.',
      );
    });

    it('should accept CSV files case-insensitively', async () => {
      const parser = makeParser([]);
      const useCase = new BulkRegisterElectoralRollUseCase(
        parser,
        makeElectionRepo(buildElection('CREATED')),
        makeElectorRepo([]),
        makeElectoralRollRepo(),
        makeAudit(),
      );

      const result = await useCase.execute({ ...baseInput, originalName: 'PADRON.CSV' });
      expect(result.totalRows).toBe(0);
    });
  });

  describe('empty CSV', () => {
    it('should return zero counts for empty CSV without querying election', async () => {
      const electionRepo = makeElectionRepo(null);
      const useCase = new BulkRegisterElectoralRollUseCase(
        makeParser([]),
        electionRepo,
        makeElectorRepo([]),
        makeElectoralRollRepo(),
        makeAudit(),
      );

      const result = await useCase.execute(baseInput);

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
    });
  });

  describe('election validation', () => {
    it('should throw ElectionNotFoundError for nonexistent election', async () => {
      const useCase = new BulkRegisterElectoralRollUseCase(
        makeParser([{ studentCode: '12345678', programCode: '1234' }]),
        makeElectionRepo(null),
        makeElectorRepo([]),
        makeElectoralRollRepo(),
        makeAudit(),
      );

      await expect(useCase.execute(baseInput)).rejects.toThrow(ElectionNotFoundError);
    });

    it.each(['CREATED', 'PENDING'] as const)('should accept %s election', async (status) => {
      const elector = buildElector('12345678', '1234');
      const useCase = new BulkRegisterElectoralRollUseCase(
        makeParser([{ studentCode: '12345678', programCode: '1234' }]),
        makeElectionRepo(buildElection(status)),
        makeElectorRepo([elector]),
        makeElectoralRollRepo([], 1),
        makeAudit(),
      );

      const result = await useCase.execute(baseInput);
      expect(result.registered).toBe(1);
    });

    it.each(['PUBLISHED', 'ACTIVE', 'CLOSED'] as const)(
      'should throw ElectionNotRegisterableError for %s election',
      async (status) => {
        const useCase = new BulkRegisterElectoralRollUseCase(
          makeParser([{ studentCode: '12345678', programCode: '1234' }]),
          makeElectionRepo(buildElection(status)),
          makeElectorRepo([]),
          makeElectoralRollRepo(),
          makeAudit(),
        );

        await expect(useCase.execute(baseInput)).rejects.toThrow(ElectionNotRegisterableError);
      },
    );
  });

  describe('status transition (PENDING rule)', () => {
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

    it('T1: calls updateStatus with PENDING when a CREATED election registers electors', async () => {
      const elector = buildElector('12345678', '1234');
      const electionRepo = makeElectionRepo(buildElection('CREATED'));
      const useCase = new BulkRegisterElectoralRollUseCase(
        makeParser([{ studentCode: '12345678', programCode: '1234' }]),
        electionRepo,
        makeElectorRepo([elector]),
        makeElectoralRollRepo([], 1),
        makeAudit(),
      );

      const result = await useCase.execute(baseInput);

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
      const useCase = new BulkRegisterElectoralRollUseCase(
        makeParser([{ studentCode: '12345678', programCode: '1234' }]),
        makeElectionRepo(buildElection('CREATED')),
        makeElectorRepo([elector]),
        makeElectoralRollRepo([], 1),
        audit,
      );

      await useCase.execute(baseInput);

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
      const useCase = new BulkRegisterElectoralRollUseCase(
        makeParser([{ studentCode: '12345678', programCode: '1234' }]),
        electionRepo,
        makeElectorRepo([elector]),
        makeElectoralRollRepo([], 1),
        makeAudit(),
      );

      await useCase.execute(baseInput);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(electionRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('T4: does not transition (updateStatus/audit) when registered is 0 on a CREATED election', async () => {
      const elector = buildElector('12345678', '1234');
      const electionRepo = makeElectionRepo(buildElection('CREATED'));
      const audit = makeAudit();
      const useCase = new BulkRegisterElectoralRollUseCase(
        makeParser([{ studentCode: '12345678', programCode: '1234' }]),
        electionRepo,
        makeElectorRepo([elector]),
        makeElectoralRollRepo([buildExistingRoll(elector.id as string)], 0),
        audit,
      );

      await useCase.execute(baseInput);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(electionRepo.updateStatus).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(audit.log).not.toHaveBeenCalledWith('ELECTION_STATUS_CHANGED', expect.anything());
    });

    it('T5: does not call updateStatus when registered is 0 on a PENDING election', async () => {
      const elector = buildElector('12345678', '1234');
      const electionRepo = makeElectionRepo(buildElection('PENDING'));
      const useCase = new BulkRegisterElectoralRollUseCase(
        makeParser([{ studentCode: '12345678', programCode: '1234' }]),
        electionRepo,
        makeElectorRepo([elector]),
        makeElectoralRollRepo([buildExistingRoll(elector.id as string)], 0),
        makeAudit(),
      );

      await useCase.execute(baseInput);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(electionRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('T6: tolerates updateStatus resolving null (race) by logging a warning and succeeding', async () => {
      const elector = buildElector('12345678', '1234');
      const electionRepo = makeElectionRepo(buildElection('CREATED'));
      (electionRepo.updateStatus as jest.Mock).mockResolvedValue(null);
      const audit = makeAudit();
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const useCase = new BulkRegisterElectoralRollUseCase(
        makeParser([{ studentCode: '12345678', programCode: '1234' }]),
        electionRepo,
        makeElectorRepo([elector]),
        makeElectoralRollRepo([], 1),
        audit,
      );

      try {
        const result = await useCase.execute(baseInput);

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
      const useCase = new BulkRegisterElectoralRollUseCase(
        makeParser([{ studentCode: '12345678', programCode: '1234' }]),
        makeElectionRepo(buildElection('PENDING')),
        makeElectorRepo([elector]),
        makeElectoralRollRepo([], 1),
        audit,
      );

      await useCase.execute(baseInput);

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
      const useCase = new BulkRegisterElectoralRollUseCase(
        makeParser([
          { studentCode: '12345678', programCode: '1234' },
          { studentCode: '99999999', programCode: '9999' },
        ]),
        makeElectionRepo(buildElection('CREATED')),
        makeElectorRepo([]),
        makeElectoralRollRepo(),
        makeAudit(),
      );

      const result = await useCase.execute(baseInput);

      expect(result.notFound).toBe(2);
      expect(result.errors).toHaveLength(2);
    });

    it('should exclude inactive electors', async () => {
      const inactiveElector = buildElector('12345678', '1234', 'INACTIVE');
      const useCase = new BulkRegisterElectoralRollUseCase(
        makeParser([{ studentCode: '12345678', programCode: '1234' }]),
        makeElectionRepo(buildElection('CREATED')),
        makeElectorRepo([inactiveElector]),
        makeElectoralRollRepo(),
        makeAudit(),
      );

      const result = await useCase.execute(baseInput);

      expect(result.invalidRows).toBe(1);
      expect(result.registered).toBe(0);
      expect(result.errors[0].reason).toBe('Elector is not active.');
    });

    it('should register active electors', async () => {
      const elector = buildElector('12345678', '1234');
      const useCase = new BulkRegisterElectoralRollUseCase(
        makeParser([{ studentCode: '12345678', programCode: '1234' }]),
        makeElectionRepo(buildElection('CREATED')),
        makeElectorRepo([elector]),
        makeElectoralRollRepo([], 1),
        makeAudit(),
      );

      const result = await useCase.execute(baseInput);

      expect(result.registered).toBe(1);
      expect(result.alreadyRegistered).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('already registered', () => {
    it('should count already-registered electors', async () => {
      const elector = buildElector('12345678', '1234');
      const existingRoll = ElectoralRollEntity.restore({
        id: 'roll-uuid',
        electionId: 'election-uuid',
        electorId: elector.id!,
        hasVoted: false,
        voteAttempts: 0,
        lastVoteAttempt: null,
        createdAt: new Date(),
      });

      const useCase = new BulkRegisterElectoralRollUseCase(
        makeParser([{ studentCode: '12345678', programCode: '1234' }]),
        makeElectionRepo(buildElection('CREATED')),
        makeElectorRepo([elector]),
        makeElectoralRollRepo([existingRoll]),
        makeAudit(),
      );

      const result = await useCase.execute(baseInput);

      expect(result.alreadyRegistered).toBe(1);
      expect(result.registered).toBe(0);
    });
  });

  describe('deduplication', () => {
    it('should deduplicate identical CSV rows', async () => {
      const elector = buildElector('12345678', '1234');
      const useCase = new BulkRegisterElectoralRollUseCase(
        makeParser([
          { studentCode: '12345678', programCode: '1234' },
          { studentCode: '12345678', programCode: '1234' },
          { studentCode: '12345678', programCode: '1234' },
        ]),
        makeElectionRepo(buildElection('CREATED')),
        makeElectorRepo([elector]),
        makeElectoralRollRepo([], 1),
        makeAudit(),
      );

      const result = await useCase.execute(baseInput);

      // totalRows is the raw CSV count
      expect(result.totalRows).toBe(3);
      // but only 1 registered (deduplicated)
      expect(result.registered).toBe(1);
    });

    it('should report error only once per unique unmatched pair', async () => {
      const useCase = new BulkRegisterElectoralRollUseCase(
        makeParser([
          { studentCode: '12345678', programCode: '1234' },
          { studentCode: '12345678', programCode: '1234' },
        ]),
        makeElectionRepo(buildElection('CREATED')),
        makeElectorRepo([]),
        makeElectoralRollRepo(),
        makeAudit(),
      );

      const result = await useCase.execute(baseInput);

      expect(result.notFound).toBe(1);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('idempotency', () => {
    it('should handle re-uploading the same CSV gracefully', async () => {
      const elector = buildElector('12345678', '1234');
      const existingRoll = ElectoralRollEntity.restore({
        id: 'roll-uuid',
        electionId: 'election-uuid',
        electorId: elector.id!,
        hasVoted: false,
        voteAttempts: 0,
        lastVoteAttempt: null,
        createdAt: new Date(),
      });

      const useCase = new BulkRegisterElectoralRollUseCase(
        makeParser([{ studentCode: '12345678', programCode: '1234' }]),
        makeElectionRepo(buildElection('CREATED')),
        makeElectorRepo([elector]),
        makeElectoralRollRepo([existingRoll]),
        makeAudit(),
      );

      const result = await useCase.execute(baseInput);

      expect(result.alreadyRegistered).toBe(1);
      expect(result.registered).toBe(0);
    });
  });

  describe('audit logging', () => {
    it('should log the bulk registration event', async () => {
      const audit = makeAudit();
      const elector = buildElector('12345678', '1234');
      const useCase = new BulkRegisterElectoralRollUseCase(
        makeParser([{ studentCode: '12345678', programCode: '1234' }]),
        makeElectionRepo(buildElection('CREATED')),
        makeElectorRepo([elector]),
        makeElectoralRollRepo([], 1),
        audit,
      );

      await useCase.execute(baseInput);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(audit.log).toHaveBeenCalledWith(
        'BULK_REGISTER_ELECTORAL_ROLL',
        'user-uuid',
        expect.objectContaining({
          electionId: 'election-uuid',
        }),
      );
    });
  });

  describe('mixed results', () => {
    it('should return accurate counts for a mix of matched, not-found, inactive, and already-registered', async () => {
      const activeElector1 = buildElector('11111111', '1111');
      const activeElector2 = buildElector('22222222', '2222');
      const inactiveElector = buildElector('33333333', '3333', 'INACTIVE');
      const existingRoll = ElectoralRollEntity.restore({
        id: 'roll-uuid',
        electionId: 'election-uuid',
        electorId: activeElector2.id!,
        hasVoted: false,
        voteAttempts: 0,
        lastVoteAttempt: null,
        createdAt: new Date(),
      });

      const useCase = new BulkRegisterElectoralRollUseCase(
        makeParser([
          { studentCode: '11111111', programCode: '1111' }, // new, active
          { studentCode: '22222222', programCode: '2222' }, // already registered
          { studentCode: '33333333', programCode: '3333' }, // inactive
          { studentCode: '44444444', programCode: '4444' }, // not found
        ]),
        makeElectionRepo(buildElection('CREATED')),
        makeElectorRepo([activeElector1, activeElector2, inactiveElector]),
        makeElectoralRollRepo([existingRoll], 1),
        makeAudit(),
      );

      const result = await useCase.execute(baseInput);

      expect(result.totalRows).toBe(4);
      expect(result.registered).toBe(1);
      expect(result.alreadyRegistered).toBe(1);
      expect(result.notFound).toBe(1);
      expect(result.invalidRows).toBe(1);
    });
  });
});
