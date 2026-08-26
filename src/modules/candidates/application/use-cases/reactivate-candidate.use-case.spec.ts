import { CandidateEntity } from '../../domain/entities/candidate.entity';
import { CandidateNotFoundError } from '../../domain/errors/candidate-not-found.error';
import { CandidateAlreadyActiveError } from '../../domain/errors/candidate-already-active.error';
import type { CandidateRepository } from '../../domain/repositories/candidate.repository.interface';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ReactivateCandidateUseCase } from './reactivate-candidate.use-case';

describe('ReactivateCandidateUseCase', () => {
  const candidates: jest.Mocked<CandidateRepository> = {
    create: jest.fn(),
    search: jest.fn(),
    findById: jest.fn(),
    updateStatus: jest.fn(),
    update: jest.fn(),
  };
  const audit: jest.Mocked<Pick<AuditLogPort, 'log'>> = {
    log: jest.fn(),
  };

  const id = 'candidate-1';
  const requestingUserId = 'user-1';

  beforeEach(() => jest.clearAllMocks());

  function activeCandidate(): CandidateEntity {
    return CandidateEntity.restore({
      id,
      firstName: 'Juan',
      lastName: 'Garcia',
      studentCode: '20201234',
      programCode: '1234',
      identificationNumber: '1000123456',
      status: CandidateEntity.DEFAULT_STATUS,
      createdAt: new Date('2026-08-19T15:00:00.000Z'),
    });
  }

  function inactiveCandidate(): CandidateEntity {
    return CandidateEntity.restore({
      id,
      firstName: 'Juan',
      lastName: 'Garcia',
      studentCode: '20201234',
      programCode: '1234',
      identificationNumber: '1000123456',
      status: CandidateEntity.INACTIVE_STATUS,
      createdAt: new Date('2026-08-19T15:00:00.000Z'),
    });
  }

  it('RC-1: reactivates an INACTIVE candidate and returns the ACTIVE entity', async () => {
    candidates.findById.mockResolvedValue(inactiveCandidate());
    candidates.updateStatus.mockResolvedValue(activeCandidate());
    const useCase = new ReactivateCandidateUseCase(candidates, audit);

    const result = await useCase.execute(id, requestingUserId);

    expect(result.status).toBe(CandidateEntity.DEFAULT_STATUS);
    expect(result.status).toBe('ACTIVE');
    expect(candidates.findById.mock.calls[0]).toEqual([id]);
    expect(candidates.updateStatus.mock.calls[0]).toEqual([id, CandidateEntity.DEFAULT_STATUS]);
  });

  it('RC-2: preserves id and all other fields', async () => {
    candidates.findById.mockResolvedValue(inactiveCandidate());
    candidates.updateStatus.mockResolvedValue(activeCandidate());
    const useCase = new ReactivateCandidateUseCase(candidates, audit);

    const result = await useCase.execute(id, requestingUserId);

    expect(result.id).toBe(id);
    expect(result.firstName).toBe('Juan');
    expect(result.lastName).toBe('Garcia');
    expect(result.studentCode).toBe('20201234');
    expect(result.programCode).toBe('1234');
    expect(result.identificationNumber).toBe('1000123456');
    expect(result.createdAt).toEqual(new Date('2026-08-19T15:00:00.000Z'));
  });

  it('RC-3: never creates a new candidate; persists only via updateStatus', async () => {
    candidates.findById.mockResolvedValue(inactiveCandidate());
    candidates.updateStatus.mockResolvedValue(activeCandidate());
    const useCase = new ReactivateCandidateUseCase(candidates, audit);

    await useCase.execute(id, requestingUserId);

    expect(candidates.updateStatus.mock.calls).toHaveLength(1);
    expect(candidates.create.mock.calls).toHaveLength(0);
    expect(candidates.update.mock.calls).toHaveLength(0);
  });

  it('RC-4: throws CandidateNotFoundError when the candidate does not exist', async () => {
    candidates.findById.mockResolvedValue(null);
    const useCase = new ReactivateCandidateUseCase(candidates, audit);

    await expect(useCase.execute('missing', requestingUserId)).rejects.toBeInstanceOf(
      CandidateNotFoundError,
    );

    expect(candidates.updateStatus.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('RC-5: throws CandidateAlreadyActiveError when the candidate is already ACTIVE (and does nothing else)', async () => {
    candidates.findById.mockResolvedValue(activeCandidate());
    const useCase = new ReactivateCandidateUseCase(candidates, audit);

    await expect(useCase.execute(id, requestingUserId)).rejects.toBeInstanceOf(
      CandidateAlreadyActiveError,
    );

    expect(candidates.updateStatus.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('RC-6: logs CANDIDATE_REACTIVATED with the requesting user and candidateId', async () => {
    candidates.findById.mockResolvedValue(inactiveCandidate());
    candidates.updateStatus.mockResolvedValue(activeCandidate());
    const useCase = new ReactivateCandidateUseCase(candidates, audit);

    await useCase.execute(id, requestingUserId);

    expect(audit.log.mock.calls[0]).toEqual([
      'CANDIDATE_REACTIVATED',
      requestingUserId,
      { candidateId: id },
    ]);
  });

  it('RC-7: skips the audit log when requestingUserId is absent', async () => {
    candidates.findById.mockResolvedValue(inactiveCandidate());
    candidates.updateStatus.mockResolvedValue(activeCandidate());
    const useCase = new ReactivateCandidateUseCase(candidates, audit);

    await useCase.execute(id, '');

    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('RC-8: throws CandidateNotFoundError when updateStatus returns null (race) and does not log', async () => {
    candidates.findById.mockResolvedValue(inactiveCandidate());
    candidates.updateStatus.mockResolvedValue(null);
    const useCase = new ReactivateCandidateUseCase(candidates, audit);

    await expect(useCase.execute(id, requestingUserId)).rejects.toBeInstanceOf(
      CandidateNotFoundError,
    );

    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('RC-9: propagates a repository failure and does not log audit', async () => {
    candidates.findById.mockResolvedValue(inactiveCandidate());
    const repositoryError = new Error('database unavailable');
    candidates.updateStatus.mockRejectedValue(repositoryError);
    const useCase = new ReactivateCandidateUseCase(candidates, audit);

    await expect(useCase.execute(id, requestingUserId)).rejects.toBe(repositoryError);

    expect(audit.log.mock.calls).toHaveLength(0);
  });
});
