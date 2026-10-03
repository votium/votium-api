import { CandidateEntity } from '../../domain/entities/candidate.entity';
import { CandidateNotFoundError } from '../../domain/errors/candidate-not-found.error';
import type { CandidateRepository } from '../../domain/repositories/candidate.repository.interface';
import type {
  CandidacyRepository,
  CandidacyWithElection,
} from 'src/modules/candidacies/domain/repositories/candidacy.repository.interface';
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

function buildElection(id: string): CandidacyWithElection {
  return {
    id: `candidacy-${id}`,
    electionId: `election-${id}`,
    candidateId: id,
    electionName: `Election ${id}`,
    electionStatus: 'PUBLISHED',
    electionStartDate: new Date('2026-09-01'),
    electionStartTime: new Date('2026-09-01T08:00:00.000Z'),
    electionEndDate: new Date('2026-09-02'),
    electionEndTime: new Date('2026-09-02T20:00:00.000Z'),
    createdAt: new Date('2026-08-15T10:00:00.000Z'),
  };
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

  const candidacies: jest.Mocked<CandidacyRepository> = {
    findUsedPositions: jest.fn(),
    create: jest.fn(),
    findByElection: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    deleteByElectionAndCandidacyId: jest.fn(),
    findByCandidate: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('U1: returns candidate with elections when candidate exists', async () => {
    const candidate = buildCandidate('candidate-1');
    const elections = [buildElection('1'), buildElection('2')];
    candidates.findById.mockResolvedValue(candidate);
    candidacies.findByCandidate.mockResolvedValue(elections);

    const useCase = new GetCandidateUseCase(candidates, candidacies);

    const result = await useCase.execute('candidate-1');

    expect(result).toEqual({ candidate, elections });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(candidates.findById).toHaveBeenCalledWith('candidate-1');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(candidacies.findByCandidate).toHaveBeenCalledWith('candidate-1');
  });

  it('U2: returns empty elections array when candidate has no elections', async () => {
    const candidate = buildCandidate('candidate-1');
    candidates.findById.mockResolvedValue(candidate);
    candidacies.findByCandidate.mockResolvedValue([]);

    const useCase = new GetCandidateUseCase(candidates, candidacies);

    const result = await useCase.execute('candidate-1');

    expect(result).toEqual({ candidate, elections: [] });
  });

  it('U3: queries the repository with the given id', async () => {
    candidates.findById.mockResolvedValue(buildCandidate('candidate-1'));
    candidacies.findByCandidate.mockResolvedValue([]);

    const useCase = new GetCandidateUseCase(candidates, candidacies);

    await useCase.execute('candidate-1');

    expect(candidates.findById.mock.calls).toHaveLength(1);
    expect(candidates.findById.mock.calls[0][0]).toBe('candidate-1');
    expect(candidacies.findByCandidate.mock.calls[0][0]).toBe('candidate-1');
  });

  it('U4: throws CandidateNotFoundError when the candidate does not exist', async () => {
    candidates.findById.mockResolvedValue(null);
    candidacies.findByCandidate.mockResolvedValue([]);

    const useCase = new GetCandidateUseCase(candidates, candidacies);

    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(CandidateNotFoundError);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(candidacies.findByCandidate).not.toHaveBeenCalled();
  });

  it('U5: propagates candidate repository failures unchanged', async () => {
    candidates.findById.mockRejectedValue(new Error('database exploded'));
    candidacies.findByCandidate.mockResolvedValue([]);

    const useCase = new GetCandidateUseCase(candidates, candidacies);

    await expect(useCase.execute('candidate-1')).rejects.toThrow('database exploded');
  });

  it('U6: propagates candidacy repository failures unchanged', async () => {
    candidates.findById.mockResolvedValue(buildCandidate('candidate-1'));
    candidacies.findByCandidate.mockRejectedValue(new Error('candidacy db error'));

    const useCase = new GetCandidateUseCase(candidates, candidacies);

    await expect(useCase.execute('candidate-1')).rejects.toThrow('candidacy db error');
  });
});
