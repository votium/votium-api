import { Injectable } from '@nestjs/common';

import { VoteProcessingPort } from '../../application/ports/vote-processing.port';

import { CandidatesService } from 'src/fabric/services/candidates.service';
import { VotersService } from 'src/fabric/services/voters.service';
import { VotingService } from 'src/fabric/services/voting.service';
import { ElectionsService } from 'src/fabric/services/elections.service';

import {
  ElectionLedgerDto,
  CastVoteResultDto,
  VoterStatusDto,
  IssueTokenResultDto,
  MarkVotedBatchResultDto,
} from '../../application/dtos';

@Injectable()
export class FabricVoteProcessingAdapter implements VoteProcessingPort {
  constructor(
    private readonly votingService: VotingService,
    private readonly candidatesService: CandidatesService,
    private readonly votersService: VotersService,
    private readonly electionService: ElectionsService,
  ) {}

  async getElection(electionId: string): Promise<ElectionLedgerDto> {
    const election = await this.electionService.getElection(electionId);
    return {
      electionId: election.electionId,
      name: election.name,
      startDate: election.startDate,
      endDate: election.endDate,
      status: election.status,
      signingPublicKey: election.signingPublicKey,
      createdBy: election.createdBy,
      updatedBy: election.updatedBy,
      timeline: {
        createdAt: election.timeline.createdAt,
        startedAt: election.timeline.startedAt,
        closedAt: election.timeline.closedAt,
        publishedAt: election.timeline.publishedAt,
        canceledAt: election.timeline.canceledAt,
      },
    };
  }

  async listCandidates(electionId: string): Promise<{ candidateId: string; name: string }[]> {
    const candidates = await this.candidatesService.listCandidates(electionId);
    return candidates.map((c) => ({ candidateId: c.candidateId, name: c.name }));
  }

  async castVote(input: {
    electionId: string;
    candidateId: string;
    nullifier: string;
    signature: string;
  }): Promise<CastVoteResultDto> {
    const result = await this.votingService.castVote(input);
    return {
      txId: result.txId,
      recovered: result.recovered,
      blockNumber: result.blockNumber,
      data: result.data,
    };
  }

  async getVoterStatus(input: { electionId: string; voterHash: string }): Promise<VoterStatusDto> {
    const status = await this.votersService.getVoterStatus({
      electionId: input.electionId,
      voterHash: input.voterHash,
    });
    return {
      electionId: status.electionId,
      voterHash: status.voterHash,
      status: status.status,
      tokenActive: status.tokenActive,
      tokenExpiresAt: status.tokenExpiresAt,
      canIssueToken: status.canIssueToken,
    };
  }

  async issueToken(input: { electionId: string; voterHash: string }): Promise<IssueTokenResultDto> {
    const result = await this.votersService.issueToken({
      electionId: input.electionId,
      voterHash: input.voterHash,
    });
    return {
      txId: result.txId,
      blockNumber: result.blockNumber,
      recovered: result.recovered,
      data: result.data,
    };
  }

  async markVotedBatch(input: {
    electionId: string;
    voterHashes: string[];
  }): Promise<MarkVotedBatchResultDto> {
    const result = await this.votersService.markVotedBatch({
      electionId: input.electionId,
      voterHashes: input.voterHashes,
    });
    return { txId: result.txId, blockNumber: result.blockNumber, data: result.data };
  }
}
