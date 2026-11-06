import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import { BallotReceiptNotFoundError } from '../../domain/errors/ballot-receipt-not-found.error';
import type {
  AnonymousBallotReceipt,
  AnonymousVotingRepository,
} from '../../domain/repositories/anonymous-voting.repository.interface';

export class GetAnonymousBallotReceiptUseCase {
  constructor(
    private readonly elections: ElectionRepository,
    private readonly repository: AnonymousVotingRepository,
  ) {}

  // Proves that a ballot was registered. The candidacy is never part of the answer.
  async execute(electionId: string, ballotId: string): Promise<AnonymousBallotReceipt> {
    const election = await this.elections.findById(electionId);
    if (!election) throw new ElectionNotFoundError(electionId);
    const receipt = await this.repository.findReceipt(electionId, ballotId);
    if (!receipt) throw new BallotReceiptNotFoundError();
    return receipt;
  }
}
