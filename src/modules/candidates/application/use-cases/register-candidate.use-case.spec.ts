import { CandidateEntity } from '../../domain/entities/candidate.entity';
import { CandidateDuplicateError } from '../../domain/errors/candidate-duplicate.error';
import type { CandidateRepository } from '../../domain/repositories/candidate.repository.interface';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { RegisterCandidateUseCase } from './register-candidate.use-case';

function buildSavedCandidate(): CandidateEntity {
  return CandidateEntity.restore({
    id: 'candidate-1',
    firstName: 'Juan',
    lastName: 'Garcia',
    studentCode: '20201234',
    programCode: '1234',
    identificationNumber: '1000123456',
    status: 'ACTIVE',
    createdAt: new Date('2026-08-19T15:00:00.000Z'),
  });
}

describe('RegisterCandidateUseCase', () => {
  const candidates: jest.Mocked<CandidateRepository> = {
    create: jest.fn(),
    search: jest.fn(),
    findById: jest.fn(),
    updateStatus: jest.fn(),
  };
  const audit: jest.Mocked<Pick<AuditLogPort, 'log'>> = {
    log: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('creates and persists a candidate with the default ACTIVE status', async () => {
    candidates.create.mockResolvedValue(buildSavedCandidate());

    const useCase = new RegisterCandidateUseCase(candidates, audit);

    const result = await useCase.execute({
      firstName: '  Juan  ',
      lastName: ' Garcia ',
      studentCode: ' 20201234 ',
      programCode: ' 1234 ',
      identificationNumber: ' 1000123456 ',
      requestingUserId: 'admin-1',
    });

    expect(result.status).toBe('ACTIVE');
    expect(candidates.create.mock.calls).toHaveLength(1);

    const persisted = candidates.create.mock.calls[0][0];
    expect(persisted).toBeInstanceOf(CandidateEntity);
    expect(persisted).toEqual(
      expect.objectContaining({
        firstName: 'Juan',
        lastName: 'Garcia',
        studentCode: '20201234',
        programCode: '1234',
        identificationNumber: '1000123456',
        status: 'ACTIVE',
      }),
    );
  });

  it('does not accept generated or client-controlled fields from the input', async () => {
    candidates.create.mockResolvedValue(buildSavedCandidate());

    const useCase = new RegisterCandidateUseCase(candidates, audit);

    await useCase.execute({
      firstName: 'Juan',
      lastName: 'Garcia',
      studentCode: '20201234',
      programCode: '1234',
      identificationNumber: '1000123456',
      requestingUserId: 'admin-1',
    });

    const persisted = candidates.create.mock.calls[0][0];
    expect(persisted.id).toBeNull();
    expect(persisted.createdAt).toBeNull();
    expect(persisted.status).toBe('ACTIVE');
  });

  it('returns the saved entity with Prisma-generated id and createdAt unchanged', async () => {
    const saved = buildSavedCandidate();
    candidates.create.mockResolvedValue(saved);

    const useCase = new RegisterCandidateUseCase(candidates, audit);

    const result = await useCase.execute({
      firstName: 'Juan',
      lastName: 'Garcia',
      studentCode: '20201234',
      programCode: '1234',
      identificationNumber: '1000123456',
      requestingUserId: 'admin-1',
    });

    expect(result).toBe(saved);
    expect(result.id).toBe('candidate-1');
    expect(result.createdAt).toEqual(new Date('2026-08-19T15:00:00.000Z'));
  });

  it('propagates a duplicate constraint rejection', async () => {
    const duplicateError = new CandidateDuplicateError();
    candidates.create.mockRejectedValue(duplicateError);

    const useCase = new RegisterCandidateUseCase(candidates, audit);

    await expect(
      useCase.execute({
        firstName: 'Juan',
        lastName: 'Garcia',
        studentCode: '20201234',
        programCode: '1234',
        identificationNumber: '1000123456',
        requestingUserId: 'admin-1',
      }),
    ).rejects.toBe(duplicateError);
  });

  it('propagates unexpected repository failures unchanged', async () => {
    candidates.create.mockRejectedValue(new Error('database exploded'));

    const useCase = new RegisterCandidateUseCase(candidates, audit);

    await expect(
      useCase.execute({
        firstName: 'Juan',
        lastName: 'Garcia',
        studentCode: '20201234',
        programCode: '1234',
        identificationNumber: '1000123456',
        requestingUserId: 'admin-1',
      }),
    ).rejects.toThrow('database exploded');
  });

  it('records an audit entry on success', async () => {
    candidates.create.mockResolvedValue(buildSavedCandidate());

    const useCase = new RegisterCandidateUseCase(candidates, audit);

    await useCase.execute({
      firstName: 'Juan',
      lastName: 'Garcia',
      studentCode: '20201234',
      programCode: '1234',
      identificationNumber: '1000123456',
      requestingUserId: 'admin-1',
    });

    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log.mock.calls[0]).toEqual([
      'CANDIDATE_REGISTERED',
      'admin-1',
      { candidateId: 'candidate-1' },
    ]);
  });

  it('skips the audit log when requestingUserId is absent', async () => {
    candidates.create.mockResolvedValue(buildSavedCandidate());

    const useCase = new RegisterCandidateUseCase(candidates, audit);

    await useCase.execute({
      firstName: 'Juan',
      lastName: 'Garcia',
      studentCode: '20201234',
      programCode: '1234',
      identificationNumber: '1000123456',
      requestingUserId: '',
    });

    expect(audit.log).not.toHaveBeenCalled();
  });
});
