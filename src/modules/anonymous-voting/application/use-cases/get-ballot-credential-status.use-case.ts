import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import type { AnonymousVotingRepository } from '../../domain/repositories/anonymous-voting.repository.interface';

export class GetBallotCredentialStatusUseCase {
  constructor(
    private readonly elections: ElectionRepository,
    private readonly repository: AnonymousVotingRepository,
  ) {}

  // Reads only the credentials table. It says whether a credential was issued, never whether a vote
  // was registered: that is visible only through the receipt.
  async execute(electionId: string, electorId: string): Promise<{ credentialIssued: boolean }> {
    const election = await this.elections.findById(electionId);
    if (!election) throw new ElectionNotFoundError(electionId);
    return { credentialIssued: await this.repository.hasCredentialIssued(electionId, electorId) };
  }
}
