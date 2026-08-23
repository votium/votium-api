import { CandidateEntity } from '../../domain/entities/candidate.entity';
import type { UpdateCandidateInput } from '../../domain/entities/update-candidate-input';
import { CandidateDuplicateError } from '../../domain/errors/candidate-duplicate.error';
import { CandidateNotFoundError } from '../../domain/errors/candidate-not-found.error';
import type { CandidateRepository } from '../../domain/repositories/candidate.repository.interface';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { UpdateCandidateUseCase } from './update-candidate.use-case';

function buildCandidate(
  overrides: Partial<UpdateCandidateInput> & { status?: string } = {},
): CandidateEntity {
  return CandidateEntity.restore({
    id: 'candidate-1',
    firstName: 'Juan',
    lastName: 'Garcia',
    studentCode: '20201234',
    programCode: '1234',
    identificationNumber: '1000123456',
    status: overrides.status ?? 'ACTIVE',
    createdAt: new Date('2026-08-19T15:00:00.000Z'),
  });
}

function buildUpdated(overrides: Partial<UpdateCandidateInput> = {}): CandidateEntity {
  return CandidateEntity.restore({
    id: 'candidate-1',
    firstName: overrides.firstName ?? 'Juan',
    lastName: overrides.lastName ?? 'Garcia',
    studentCode: '20201234',
    programCode: overrides.programCode ?? '1234',
    identificationNumber: overrides.identificationNumber ?? '1000123456',
    status: 'ACTIVE',
    createdAt: new Date('2026-08-19T15:00:00.000Z'),
  });
}

describe('UpdateCandidateUseCase', () => {
  let candidates: jest.Mocked<CandidateRepository>;
  let audit: jest.Mocked<Pick<AuditLogPort, 'log'>>;

  beforeEach(() => {
    candidates = {
      create: jest.fn(),
      search: jest.fn(),
      findById: jest.fn(),
      updateStatus: jest.fn(),
      update: jest.fn(),
    };
    audit = { log: jest.fn() };
    jest.clearAllMocks();
  });

  function buildUseCase(): UpdateCandidateUseCase {
    return new UpdateCandidateUseCase(candidates, audit);
  }

  it('UC-01: updates a candidate and returns the persisted entity', async () => {
    const existing = buildCandidate();
    const updated = buildUpdated({
      firstName: 'Updated',
      lastName: 'Name',
      programCode: '2710',
      identificationNumber: '9999999999',
    });
    candidates.findById.mockResolvedValue(existing);
    candidates.update.mockResolvedValue(updated);

    const result = await buildUseCase().execute(
      'candidate-1',
      {
        firstName: 'Updated',
        lastName: 'Name',
        programCode: '2710',
        identificationNumber: '9999999999',
      },
      'admin-1',
    );

    expect(result).toBe(updated);
    expect(candidates.update.mock.calls).toHaveLength(1);
  });

  it('UC-02: partial update only changes the provided fields', async () => {
    const existing = buildCandidate();
    const updated = buildUpdated({ firstName: 'OnlyFirstName' });
    candidates.findById.mockResolvedValue(existing);
    candidates.update.mockResolvedValue(updated);

    const result = await buildUseCase().execute(
      'candidate-1',
      { firstName: 'OnlyFirstName' },
      'admin-1',
    );

    expect(result.firstName).toBe('OnlyFirstName');
    expect(result.lastName).toBe('Garcia');
    expect(result.programCode).toBe('1234');
    expect(result.identificationNumber).toBe('1000123456');
    expect(candidates.update.mock.calls[0]).toEqual([
      'candidate-1',
      { firstName: 'OnlyFirstName' },
    ]);
  });

  it('UC-03: throws CandidateNotFoundError when the candidate does not exist', async () => {
    candidates.findById.mockResolvedValue(null);

    await expect(
      buildUseCase().execute('missing', { firstName: 'X' }, 'admin-1'),
    ).rejects.toBeInstanceOf(CandidateNotFoundError);

    expect(candidates.update.mock.calls).toHaveLength(0);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('UC-04: throws CandidateNotFoundError for a logically deleted candidate', async () => {
    candidates.findById.mockResolvedValue(buildCandidate({ status: 'INACTIVE' }));

    await expect(
      buildUseCase().execute('candidate-1', { firstName: 'X' }, 'admin-1'),
    ).rejects.toBeInstanceOf(CandidateNotFoundError);

    expect(candidates.update.mock.calls).toHaveLength(0);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('UC-05: propagates CandidateDuplicateError on a unique constraint violation', async () => {
    candidates.findById.mockResolvedValue(buildCandidate());
    candidates.update.mockRejectedValue(new CandidateDuplicateError());

    await expect(
      buildUseCase().execute('candidate-1', { identificationNumber: 'dup' }, 'admin-1'),
    ).rejects.toBeInstanceOf(CandidateDuplicateError);

    expect(audit.log).not.toHaveBeenCalled();
  });

  it('UC-06: propagates unexpected repository errors unchanged', async () => {
    const boom = new Error('database exploded');
    candidates.findById.mockResolvedValue(buildCandidate());
    candidates.update.mockRejectedValue(boom);

    await expect(
      buildUseCase().execute('candidate-1', { firstName: 'X' }, 'admin-1'),
    ).rejects.toThrow('database exploded');
  });

  it('UC-07: records an audit entry on success', async () => {
    candidates.findById.mockResolvedValue(buildCandidate());
    candidates.update.mockResolvedValue(buildUpdated({ firstName: 'Updated' }));

    await buildUseCase().execute('candidate-1', { firstName: 'Updated' }, 'admin-1');

    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith('CANDIDATE_UPDATED', 'admin-1', {
      candidateId: 'candidate-1',
    });
  });

  it('UC-08: skips the audit log when requestingUserId is empty', async () => {
    candidates.findById.mockResolvedValue(buildCandidate());
    candidates.update.mockResolvedValue(buildUpdated({ firstName: 'Updated' }));

    await buildUseCase().execute('candidate-1', { firstName: 'Updated' }, '');

    expect(audit.log).not.toHaveBeenCalled();
  });

  it('UC-09: preserves immutable fields (id, studentCode, status, createdAt)', async () => {
    const existing = buildCandidate();
    const updated = buildUpdated({ firstName: 'Updated' });
    candidates.findById.mockResolvedValue(existing);
    candidates.update.mockResolvedValue(updated);

    const result = await buildUseCase().execute('candidate-1', { firstName: 'Updated' }, 'admin-1');

    expect(result.id).toBe('candidate-1');
    expect(result.studentCode).toBe('20201234');
    expect(result.status).toBe('ACTIVE');
    expect(result.createdAt?.toISOString()).toBe('2026-08-19T15:00:00.000Z');
  });

  it('UC-10: mutates the entity before persisting it', async () => {
    const existing = buildCandidate();
    const updateSpy = jest.spyOn(existing, 'update');
    const input: UpdateCandidateInput = { firstName: 'Updated', lastName: 'Name' };
    candidates.findById.mockResolvedValue(existing);
    candidates.update.mockResolvedValue(buildUpdated({ firstName: 'Updated', lastName: 'Name' }));

    await buildUseCase().execute('candidate-1', input, 'admin-1');

    expect(updateSpy).toHaveBeenCalledWith(input);
    expect(updateSpy.mock.invocationCallOrder[0]).toBeLessThan(
      (candidates.update as jest.Mock).mock.invocationCallOrder[0],
    );
  });
});
