import { Injectable } from '@nestjs/common';
import { VotingService } from '../../../../fabric/services/voting.service';
import { ElectionResultsPort } from '../../application/ports/election-results.port';
import { ElectionTallyLedgerDto } from '../../application/dtos/election-tally-ledger.dto';

@Injectable()
export class FabricElectionResultsAdapter implements ElectionResultsPort {
  constructor(private readonly votingService: VotingService) {}

  async tally(electionId: string): Promise<ElectionTallyLedgerDto> {
    const tally = await this.votingService.getTally(electionId);
    return {
      status: tally.status,
      total: tally.total,
      results: tally.results.map((entry) => ({
        candidateId: entry.candidateId,
        name: entry.name,
        votes: entry.votes,
      })),
    };
  }
}
