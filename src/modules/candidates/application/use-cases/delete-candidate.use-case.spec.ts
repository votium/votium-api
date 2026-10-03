import { CandidateEntity } from '../../domain/entities/candidate.entity';
import { CandidateNotFoundError } from '../../domain/errors/candidate-not-found.error';
import type { CandidateRepository } from '../../domain/repositories/candidate.repository.interface';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { DeleteCandidateUseCase } from './delete-candidate.use-case';

describe('DeleteCandidateUseCase', () => {
  const candidates: jest.Mocked<CandidateRepository> = {
    create: jest.fn(),
    search: jest.fn(),
    findById: jest.fn(),
    softDelete: jest.fn(),
    updateStatus: jest.fn(),
    update: jest.fn(),
  };
  const audit: jest.Mocked<Pick<AuditLogPort, 'log'>> = {
    log: jest.fn(),
  };

  const id = 'candidate-1';
  const requestingUserId = 'user-1';

  beforeEach(() => jest.clearAllMocks());

  function existingCandidate(): CandidateEntity {
    return CandidateEntity.restore({
      id,
      firstName: 'Juan',
      lastName: 'Garcia',
      studentCode: '20201234',
      programCode: '1234',
      identificationNumber: '1000123456',
      status: CandidateEntity.DEFAULT_STATUS,
      createdAt: new Date('2026-08-19T15:00:00.000Z'),
      deletedAt: null,
      companionFirstName: null,
      companionLastName: null,
      companionStudentCode: null,
      companionProgramCode: null,
      companionIdentification: null,
    });
  }

  function buildUseCase(): DeleteCandidateUseCase {
    return new DeleteCandidateUseCase(candidates, audit);
  }

  it('DC-1: deletes an existing candidate and logs the audit entry', async () => {
    candidates.findById.mockResolvedValue(existingCandidate());
    candidates.softDelete.mockResolvedValue(existingCandidate());

    const result = await buildUseCase().execute(id, requestingUserId);

    expect(result).toBeUndefined();
    expect(candidates.findById.mock.calls[0]).toEqual([id]);
    expect(candidates.softDelete.mock.calls[0]).toEqual([id]);
    expect(audit.log.mock.calls[0]).toEqual([
      'CANDIDATE_DELETED',
      requestingUserId,
      { candidateId: id },
    ]);
  });

  it('DC-2: throws CandidateNotFoundError when the candidate does not exist', async () => {
    candidates.findById.mockResolvedValue(null);

    await expect(buildUseCase().execute('missing', requestingUserId)).rejects.toBeInstanceOf(
      CandidateNotFoundError,
    );

    expect(candidates.softDelete.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('DC-3: throws CandidateNotFoundError when softDelete returns null (race) and does not log', async () => {
    candidates.findById.mockResolvedValue(existingCandidate());
    candidates.softDelete.mockResolvedValue(null);

    await expect(buildUseCase().execute(id, requestingUserId)).rejects.toBeInstanceOf(
      CandidateNotFoundError,
    );

    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('DC-4: propagates a repository failure and does not log audit', async () => {
    candidates.findById.mockResolvedValue(existingCandidate());
    const repositoryError = new Error('database unavailable');
    candidates.softDelete.mockRejectedValue(repositoryError);

    await expect(buildUseCase().execute(id, requestingUserId)).rejects.toBe(repositoryError);

    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('DC-5: never creates, searches nor updates the status', async () => {
    candidates.findById.mockResolvedValue(existingCandidate());
    candidates.softDelete.mockResolvedValue(existingCandidate());

    await buildUseCase().execute(id, requestingUserId);

    expect(candidates.create.mock.calls).toHaveLength(0);
    expect(candidates.search.mock.calls).toHaveLength(0);
    expect(candidates.updateStatus.mock.calls).toHaveLength(0);
    expect(candidates.update.mock.calls).toHaveLength(0);
  });

  it('DC-6: skips the audit log when requestingUserId is absent', async () => {
    candidates.findById.mockResolvedValue(existingCandidate());
    candidates.softDelete.mockResolvedValue(existingCandidate());

    await buildUseCase().execute(id, '');

    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('DC-7: marks the entity as deleted before persisting', async () => {
    const candidate = existingCandidate();
    candidates.findById.mockResolvedValue(candidate);
    candidates.softDelete.mockResolvedValue(candidate);

    await buildUseCase().execute(id, requestingUserId);

    expect(candidate.isDeleted()).toBe(true);
    expect(candidates.softDelete.mock.calls[0]).toEqual([id]);
  });
});
