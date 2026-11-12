/* eslint-disable @typescript-eslint/unbound-method */
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import type { ElectoralRollRepository } from 'src/modules/elections/domain/repositories/electoral-roll.repository.interface';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import { ElectoralRollNotFoundError } from 'src/modules/elections/domain/errors/electoral-roll-not-found.error';
import { ElectorNotFoundError } from '../../domain/errors/elector-not-found.error';
import type { ElectorRepository } from '../../domain/repositories/elector.repository.interface';
import { CheckElectorHasVotedUseCase } from './check-elector-has-voted.use-case';

const ELECTOR_ID = '11111111-1111-4111-8111-111111111111';
const ELECTION_ID = '22222222-2222-4222-8222-222222222222';

describe('CheckElectorHasVotedUseCase', () => {
  let electors: jest.Mocked<Pick<ElectorRepository, 'findById'>>;
  let elections: jest.Mocked<Pick<ElectionRepository, 'findById'>>;
  let electoralRolls: jest.Mocked<ElectoralRollRepository>;
  let useCase: CheckElectorHasVotedUseCase;

  beforeEach(() => {
    electors = { findById: jest.fn().mockResolvedValue({ id: ELECTOR_ID }) };
    elections = { findById: jest.fn().mockResolvedValue({ id: ELECTION_ID }) };
    electoralRolls = {
      findByElectionAndElectorIds: jest.fn(),
      createMany: jest.fn(),
      countByElection: jest.fn(),
      countByElectionIds: jest.fn(),
      deleteByElectionAndElectorId: jest.fn(),
      findHasVoted: jest.fn(),
      countVotedByElectionIds: jest.fn(),
      countActiveParticipationByElector: jest.fn(),
    };
    useCase = new CheckElectorHasVotedUseCase(
      electors as unknown as ElectorRepository,
      elections as unknown as ElectionRepository,
      electoralRolls,
    );
  });

  const input = { electorId: ELECTOR_ID, electionId: ELECTION_ID };

  it('HV-01: throws ElectorNotFoundError and skips election and roll lookups', async () => {
    electors.findById.mockResolvedValue(null);

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(ElectorNotFoundError);
    expect(elections.findById).not.toHaveBeenCalled();
    expect(electoralRolls.findHasVoted).not.toHaveBeenCalled();
  });

  it('HV-02: throws ElectionNotFoundError and skips the roll lookup', async () => {
    elections.findById.mockResolvedValue(null);

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(ElectionNotFoundError);
    expect(electoralRolls.findHasVoted).not.toHaveBeenCalled();
  });

  it('HV-03: throws ElectoralRollNotFoundError when the elector is not in the roll', async () => {
    electoralRolls.findHasVoted.mockResolvedValue(null);

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(ElectoralRollNotFoundError);
  });

  it('HV-04: returns hasVoted false when the roll row has not voted', async () => {
    electoralRolls.findHasVoted.mockResolvedValue(false);

    await expect(useCase.execute(input)).resolves.toEqual({
      electionId: ELECTION_ID,
      electorId: ELECTOR_ID,
      hasVoted: false,
    });
  });

  it('HV-05: returns hasVoted true when the roll row has voted', async () => {
    electoralRolls.findHasVoted.mockResolvedValue(true);

    await expect(useCase.execute(input)).resolves.toEqual({
      electionId: ELECTION_ID,
      electorId: ELECTOR_ID,
      hasVoted: true,
    });
  });

  it('HV-06: validates in order elector -> election -> roll with the given ids', async () => {
    electoralRolls.findHasVoted.mockResolvedValue(true);

    await useCase.execute(input);

    expect(electors.findById.mock.calls).toEqual([[ELECTOR_ID]]);
    expect(elections.findById.mock.calls).toEqual([[ELECTION_ID]]);
    expect(electoralRolls.findHasVoted.mock.calls).toEqual([[ELECTION_ID, ELECTOR_ID]]);
    expect(electors.findById.mock.invocationCallOrder[0]).toBeLessThan(
      elections.findById.mock.invocationCallOrder[0],
    );
    expect(elections.findById.mock.invocationCallOrder[0]).toBeLessThan(
      electoralRolls.findHasVoted.mock.invocationCallOrder[0],
    );
  });

  it('HV-07: is read-only and never reads full roll rows with vote data', async () => {
    electoralRolls.findHasVoted.mockResolvedValue(true);

    await useCase.execute(input);

    expect(electoralRolls.findByElectionAndElectorIds).not.toHaveBeenCalled();
    expect(electoralRolls.createMany).not.toHaveBeenCalled();
    expect(electoralRolls.deleteByElectionAndElectorId).not.toHaveBeenCalled();
  });
});
