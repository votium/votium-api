import type { RegisterVoteResult } from '../../application/use-cases/register-vote.use-case';
import { RegisterVoteResponseDto } from '../dtos/register-vote-response.dto';
import { VotePresenter } from './vote.presenter';

describe('VotePresenter', () => {
  it('VP-01: maps a candidacy-vote result into the public response shape', () => {
    const result: RegisterVoteResult = {
      electionId: 'election-1',
      candidacyId: 'candidacy-1',
      registeredAt: new Date('2026-09-29T14:03:00.000Z'),
    };

    const dto = VotePresenter.toResponse(result);

    expect(dto).toBeInstanceOf(RegisterVoteResponseDto);
    expect(dto).toEqual({
      electionId: 'election-1',
      candidacyId: 'candidacy-1',
      registeredAt: '2026-09-29T14:03:00.000Z',
    });
  });

  it('VP-02: serializes registeredAt as an ISO-8601 string', () => {
    const result: RegisterVoteResult = {
      electionId: 'election-1',
      candidacyId: 'blank',
      registeredAt: new Date('2026-09-29T14:03:00.000Z'),
    };

    const dto = VotePresenter.toResponse(result);

    expect(typeof dto.registeredAt).toBe('string');
    expect(dto.registeredAt).toBe('2026-09-29T14:03:00.000Z');
  });

  it('VP-03: passes through the blank literal for a blank vote', () => {
    const result: RegisterVoteResult = {
      electionId: 'election-1',
      candidacyId: 'blank',
      registeredAt: new Date('2026-09-29T14:03:00.000Z'),
    };

    const dto = VotePresenter.toResponse(result);

    expect(dto.candidacyId).toBe('blank');
  });

  it('VP-04: exposes exactly the documented fields (no identity/persistence leakage)', () => {
    const result: RegisterVoteResult = {
      electionId: 'election-1',
      candidacyId: 'candidacy-1',
      registeredAt: new Date('2026-09-29T14:03:00.000Z'),
    };

    const dto = VotePresenter.toResponse(result);

    expect(Object.keys(dto).sort()).toEqual(['candidacyId', 'electionId', 'registeredAt']);
  });
});
