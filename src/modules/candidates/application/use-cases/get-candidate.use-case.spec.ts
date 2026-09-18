import { CandidateEntity } from '../../domain/entities/candidate.entity';
import { CandidateNotFoundError } from '../../domain/errors/candidate-not-found.error';
import type { CandidateRepository } from '../../domain/repositories/candidate.repository.interface';
import { GetCandidateUseCase } from './get-candidate.use-case';

function buildCandidate(id: string): CandidateEntity {
  return CandidateEntity.restore({
    id,
    firstName: 'Juan',
    lastName: 'Garcia',
    studentCode: '202012345',
    programCode: '1234',
    identificationNumber: '1000000000',
    status: 'ACTIVE',
    createdAt: new Date('2026-08-19T15:00:00.000Z'),
    companionFirstName: null,
    companionLastName: null,
    companionStudentCode: null,
    companionProgramCode: null,
    companionIdentification: null,
  });
}

describe('GetCandidateUseCase', () => {
  const candidates: jest.Mocked<CandidateRepository> = {
    create: jest.fn(),
    search: jest.fn(),
    findById: jest.fn(),
    softDelete: jest.fn(),
    updateStatus: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('U1: returns the candidate entity when it exists', async () => {
    const candidate = buildCandidate('candidate-1');
    candidates.findById.mockResolvedValue(candidate);

    const useCase = new GetCandidateUseCase(candidates);

    await expect(useCase.execute('candidate-1')).resolves.toBe(candidate);
  });

  it('U2: queries the repository with the given id', async () => {
    candidates.findById.mockResolvedValue(buildCandidate('candidate-1'));

    const useCase = new GetCandidateUseCase(candidates);

    await useCase.execute('candidate-1');

    expect(candidates.findById.mock.calls).toHaveLength(1);
    expect(candidates.findById.mock.calls[0][0]).toBe('candidate-1');
  });

  it('U3: throws CandidateNotFoundError when the candidate does not exist', async () => {
    candidates.findById.mockResolvedValue(null);

    const useCase = new GetCandidateUseCase(candidates);

    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(CandidateNotFoundError);
  });

  it('U4: propagates repository failures unchanged', async () => {
    candidates.findById.mockRejectedValue(new Error('database exploded'));

    const useCase = new GetCandidateUseCase(candidates);

    await expect(useCase.execute('candidate-1')).rejects.toThrow('database exploded');
  });
});
