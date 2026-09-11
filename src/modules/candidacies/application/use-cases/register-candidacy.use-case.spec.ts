import { CandidateEntity } from 'src/modules/candidates/domain/entities/candidate.entity';
import { CandidateNotFoundError } from 'src/modules/candidates/domain/errors/candidate-not-found.error';
import type { CandidateRepository } from 'src/modules/candidates/domain/repositories/candidate.repository.interface';
import {
  ElectionEntity,
  type ElectionStatus,
} from 'src/modules/elections/domain/entities/election.entity';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { CandidacyEntity } from '../../domain/entities/candidacy.entity';
import { CandidacyDuplicateError } from '../../domain/errors/candidacy-duplicate.error';
import { ElectionNotEligibleForCandidacyError } from '../../domain/errors/election-not-eligible-for-candidacy.error';
import type { CandidacyRepository } from '../../domain/repositories/candidacy.repository.interface';
import { RegisterCandidacyUseCase } from './register-candidacy.use-case';

function makeCandidateRepo(candidate: CandidateEntity | null): CandidateRepository {
  return {
    create: jest.fn(),
    findById: jest.fn().mockResolvedValue(candidate),
    updateStatus: jest.fn(),
    update: jest.fn(),
    search: jest.fn(),
  };
}

function makeElectionRepo(election: ElectionEntity | null): ElectionRepository {
  return {
    findAll: jest.fn(),
    create: jest.fn(),
    findById: jest.fn().mockResolvedValue(election),
    update: jest.fn(),
    updateStatus: jest.fn(),
    hasCandidates: jest.fn(),
    hasVotes: jest.fn(),
    delete: jest.fn(),
  };
}

function makeCandidacyRepo(
  maxPosition = 0,
  saved: CandidacyEntity | null = null,
): CandidacyRepository {
  return {
    findMaxPosition: jest.fn().mockResolvedValue(maxPosition),
    create: jest.fn().mockResolvedValue(
      saved ??
        CandidacyEntity.restore({
          id: 'candidacy-uuid',
          electionId: 'election-uuid',
          candidateId: 'candidate-uuid',
          positionNumber: maxPosition + 1,
          imageUrl: null,
          createdAt: new Date('2026-08-29T15:00:00.000Z'),
        }),
    ),
    findByElection: jest.fn(),
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

function buildCandidate(): CandidateEntity {
  return CandidateEntity.restore({
    id: 'candidate-uuid',
    firstName: 'Juan',
    lastName: 'Garcia',
    studentCode: 'CAND-1234',
    programCode: '1234',
    identificationNumber: 'ID-12345678',
    status: 'ACTIVE',
    createdAt: new Date(),
  });
}

const baseInput = {
  electionId: 'election-uuid',
  candidateId: 'candidate-uuid',
  requestingUserId: 'admin-uuid',
};

describe('RegisterCandidacyUseCase', () => {
  describe('happy path and position computation', () => {
    it('U-01: registers a candidate in a Pending election with the next available position (max + 1)', async () => {
      const candidacyRepo = makeCandidacyRepo(3);
      const audit = makeAudit();
      const useCase = new RegisterCandidacyUseCase(
        makeCandidateRepo(buildCandidate()),
        makeElectionRepo(buildElection('PENDING')),
        candidacyRepo,
        audit,
      );

      const result = await useCase.execute(baseInput);

      expect(result.positionNumber).toBe(4);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(candidacyRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          electionId: 'election-uuid',
          candidateId: 'candidate-uuid',
          positionNumber: 4,
          id: null,
        }),
      );
    });

    it('U-02: assigns position 1 when no prior candidacy exists (max 0)', async () => {
      const candidacyRepo = makeCandidacyRepo(0);
      const useCase = new RegisterCandidacyUseCase(
        makeCandidateRepo(buildCandidate()),
        makeElectionRepo(buildElection('PENDING')),
        candidacyRepo,
        makeAudit(),
      );

      const result = await useCase.execute(baseInput);

      expect(result.positionNumber).toBe(1);
    });

    it('U-03: appends after an existing max', async () => {
      const candidacyRepo = makeCandidacyRepo(3);
      const useCase = new RegisterCandidacyUseCase(
        makeCandidateRepo(buildCandidate()),
        makeElectionRepo(buildElection('PENDING')),
        candidacyRepo,
        makeAudit(),
      );

      const result = await useCase.execute(baseInput);

      expect(result.positionNumber).toBe(4);
    });
  });

  describe('guards', () => {
    it('U-04: throws ElectionNotFoundError when the election does not exist (checked first)', async () => {
      const electionRepo = makeElectionRepo(null);
      const candidacyRepo = makeCandidacyRepo();
      const useCase = new RegisterCandidacyUseCase(
        makeCandidateRepo(buildCandidate()),
        electionRepo,
        candidacyRepo,
        makeAudit(),
      );

      await expect(useCase.execute(baseInput)).rejects.toBeInstanceOf(ElectionNotFoundError);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(candidacyRepo.findMaxPosition).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(candidacyRepo.create).not.toHaveBeenCalled();
    });

    it('U-05: throws CandidateNotFoundError when the candidate does not exist', async () => {
      const candidacyRepo = makeCandidacyRepo();
      const useCase = new RegisterCandidacyUseCase(
        makeCandidateRepo(null),
        makeElectionRepo(buildElection('PENDING')),
        candidacyRepo,
        makeAudit(),
      );

      await expect(useCase.execute(baseInput)).rejects.toBeInstanceOf(CandidateNotFoundError);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(candidacyRepo.findMaxPosition).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(candidacyRepo.create).not.toHaveBeenCalled();
    });

    it.each(['CREATED', 'PUBLISHED', 'ACTIVE', 'CLOSED'] as const)(
      'U-06: throws ElectionNotEligibleForCandidacyError for a %s election',
      async (status) => {
        const candidacyRepo = makeCandidacyRepo();
        const audit = makeAudit();
        const useCase = new RegisterCandidacyUseCase(
          makeCandidateRepo(buildCandidate()),
          makeElectionRepo(buildElection(status)),
          candidacyRepo,
          audit,
        );

        await expect(useCase.execute(baseInput)).rejects.toBeInstanceOf(
          ElectionNotEligibleForCandidacyError,
        );
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(candidacyRepo.findMaxPosition).not.toHaveBeenCalled();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(candidacyRepo.create).not.toHaveBeenCalled();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(audit.log).not.toHaveBeenCalled();
      },
    );
  });

  describe('persistence and errors', () => {
    it('U-08: propagates CandidacyDuplicateError from the repository', async () => {
      const candidacyRepo: CandidacyRepository = {
        findMaxPosition: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockRejectedValue(new CandidacyDuplicateError()),
        findByElection: jest.fn(),
      };
      const audit = makeAudit();
      const useCase = new RegisterCandidacyUseCase(
        makeCandidateRepo(buildCandidate()),
        makeElectionRepo(buildElection('PENDING')),
        candidacyRepo,
        audit,
      );

      await expect(useCase.execute(baseInput)).rejects.toBeInstanceOf(CandidacyDuplicateError);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('U-09: propagates unexpected repository failures unchanged', async () => {
      const candidacyRepo: CandidacyRepository = {
        findMaxPosition: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockRejectedValue(new Error('database exploded')),
        findByElection: jest.fn(),
      };
      const useCase = new RegisterCandidacyUseCase(
        makeCandidateRepo(buildCandidate()),
        makeElectionRepo(buildElection('PENDING')),
        candidacyRepo,
        makeAudit(),
      );

      await expect(useCase.execute(baseInput)).rejects.toThrow('database exploded');
    });
  });

  describe('audit logging', () => {
    it('U-10: records CANDIDACY_REGISTERED on success', async () => {
      const audit = makeAudit();
      const useCase = new RegisterCandidacyUseCase(
        makeCandidateRepo(buildCandidate()),
        makeElectionRepo(buildElection('PENDING')),
        makeCandidacyRepo(0),
        audit,
      );

      await useCase.execute(baseInput);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(audit.log).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(audit.log).toHaveBeenCalledWith(
        'CANDIDACY_REGISTERED',
        'admin-uuid',
        expect.objectContaining({
          electionId: 'election-uuid',
          candidateId: 'candidate-uuid',
          candidacyId: 'candidacy-uuid',
        }),
      );
    });

    it('U-11: skips the audit log when requestingUserId is absent', async () => {
      const audit = makeAudit();
      const useCase = new RegisterCandidacyUseCase(
        makeCandidateRepo(buildCandidate()),
        makeElectionRepo(buildElection('PENDING')),
        makeCandidacyRepo(0),
        audit,
      );

      await useCase.execute({ ...baseInput, requestingUserId: '' });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(audit.log).not.toHaveBeenCalled();
    });
  });
});
