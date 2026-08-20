import { CandidateEntity } from '../../domain/entities/candidate.entity';
import { CandidateNotFoundError } from '../../domain/errors/candidate-not-found.error';
import type { CandidateRepository } from '../../domain/repositories/candidate.repository.interface';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { DeactivateCandidateUseCase } from './deactivate-candidate.use-case';

describe('DeactivateCandidateUseCase', () => {
  const candidates: jest.Mocked<CandidateRepository> = {
    create: jest.fn(),
    search: jest.fn(),
    findById: jest.fn(),
    updateStatus: jest.fn(),
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

  it('U1: deactivates an active candidate, persists the status and logs audit', async () => {
    candidates.findById.mockResolvedValue(activeCandidate());
    candidates.updateStatus.mockResolvedValue(inactiveCandidate());
    const useCase = new DeactivateCandidateUseCase(candidates, audit);

    await useCase.execute(id, requestingUserId);

    expect(candidates.findById.mock.calls[0]).toEqual([id]);
    expect(candidates.updateStatus.mock.calls[0]).toEqual([id, CandidateEntity.INACTIVE_STATUS]);
    expect(audit.log.mock.calls[0]).toEqual([
      'CANDIDATE_DEACTIVATED',
      requestingUserId,
      { candidateId: id },
    ]);
  });

  it('U2: throws CandidateNotFoundError when the candidate does not exist and does nothing else', async () => {
    candidates.findById.mockResolvedValue(null);
    const useCase = new DeactivateCandidateUseCase(candidates, audit);

    await expect(useCase.execute('missing', requestingUserId)).rejects.toBeInstanceOf(
      CandidateNotFoundError,
    );

    expect(candidates.updateStatus.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('U3: is idempotent when the candidate is already inactive and does nothing else', async () => {
    candidates.findById.mockResolvedValue(inactiveCandidate());
    const useCase = new DeactivateCandidateUseCase(candidates, audit);

    await useCase.execute(id, requestingUserId);

    expect(candidates.updateStatus.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('U4: throws CandidateNotFoundError when updateStatus returns null (race) and does not log audit', async () => {
    candidates.findById.mockResolvedValue(activeCandidate());
    candidates.updateStatus.mockResolvedValue(null);
    const useCase = new DeactivateCandidateUseCase(candidates, audit);

    await expect(useCase.execute(id, requestingUserId)).rejects.toBeInstanceOf(
      CandidateNotFoundError,
    );

    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('U5: propagates a repository failure and does not log audit', async () => {
    candidates.findById.mockResolvedValue(activeCandidate());
    const repositoryError = new Error('database unavailable');
    candidates.updateStatus.mockRejectedValue(repositoryError);
    const useCase = new DeactivateCandidateUseCase(candidates, audit);

    await expect(useCase.execute(id, requestingUserId)).rejects.toBe(repositoryError);

    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('U6: only calls findById and updateStatus, never create or search', async () => {
    candidates.findById.mockResolvedValue(activeCandidate());
    candidates.updateStatus.mockResolvedValue(inactiveCandidate());
    const useCase = new DeactivateCandidateUseCase(candidates, audit);

    await useCase.execute(id, requestingUserId);

    expect(candidates.findById.mock.calls).toHaveLength(1);
    expect(candidates.updateStatus.mock.calls).toHaveLength(1);
    expect(candidates.create.mock.calls).toHaveLength(0);
    expect(candidates.search.mock.calls).toHaveLength(0);
  });

  it('U7: propagates the requestingUserId to the audit log', async () => {
    candidates.findById.mockResolvedValue(activeCandidate());
    candidates.updateStatus.mockResolvedValue(inactiveCandidate());
    const useCase = new DeactivateCandidateUseCase(candidates, audit);

    await useCase.execute(id, 'auditor-42');

    expect(audit.log.mock.calls[0]).toEqual([
      'CANDIDATE_DEACTIVATED',
      'auditor-42',
      { candidateId: id },
    ]);
  });
});
