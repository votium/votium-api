import type { RegisterVoteResult } from '../../application/use-cases/register-vote.use-case';
import { RegisterVoteResponseDto } from '../dtos/register-vote-response.dto';

export class VotePresenter {
  static toResponse(result: RegisterVoteResult): RegisterVoteResponseDto {
    return new RegisterVoteResponseDto({
      electionId: result.electionId,
      candidacyId: result.candidacyId,
      registeredAt: result.registeredAt.toISOString(),
    });
  }
}
