import { ElectionLedgerDto } from '../dtos/election-ledger.dto';
import {
  IssueTokenResultDto,
  VoterStatusDto,
  CastVoteResultDto,
  MarkVotedBatchResultDto,
} from '../dtos';

export abstract class VoteProcessingPort {
  abstract getVoterStatus(input: {
    electionId: string;
    voterHash: string;
  }): Promise<VoterStatusDto>;

  abstract issueToken(input: {
    electionId: string;
    voterHash: string;
  }): Promise<IssueTokenResultDto>;

  abstract castVote(input: {
    electionId: string;
    candidateId: string;
    nullifier: string;
    signature: string;
  }): Promise<CastVoteResultDto>;

  abstract markVotedBatch(input: {
    electionId: string;
    voterHashes: string[];
  }): Promise<MarkVotedBatchResultDto>;

  abstract getElection(electionId: string): Promise<ElectionLedgerDto>;

  abstract listCandidates(electionId: string): Promise<
    {
      candidateId: string;
      name: string;
    }[]
  >;
}
