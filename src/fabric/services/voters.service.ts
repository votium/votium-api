import { Injectable } from '@nestjs/common';
import { FabricInvoker } from '../client/fabric-invoker';
import { validateInput } from '../dto/validate';
import { VoterBatchDto, VoterKeyDto } from '../dto/inputs';
import {
  IssueTokenResult,
  MarkVotedResult,
  ReadOptions,
  RegisterVotersResult,
  TxResult,
  VoterStatusResult,
} from '../types';

@Injectable()
export class VotersService {
  constructor(private readonly fabric: FabricInvoker) { }

  async registerVoters(input: VoterBatchDto): Promise<TxResult<RegisterVotersResult>> {
    const v = await validateInput(VoterBatchDto, input);
    return this.fabric.submit<RegisterVotersResult>('voters', 'RegisterVoters', [
      v.electionId,
      JSON.stringify(v.voterHashes),
    ]);
  }

  async getVoterStatus(input: VoterKeyDto, opts: ReadOptions = {}): Promise<VoterStatusResult> {
    const v = await validateInput(VoterKeyDto, input);
    return this.fabric.evaluate<VoterStatusResult>(
      'voters',
      'GetVoterStatus',
      [v.electionId, v.voterHash],
      opts.profile,
    );
  }

  async issueToken(input: VoterKeyDto): Promise<TxResult<IssueTokenResult>> {
    const v = await validateInput(VoterKeyDto, input);
    return this.fabric.submit<IssueTokenResult>('voters', 'IssueToken', [
      v.electionId,
      v.voterHash,
    ]);
  }

  async markVoted(input: VoterKeyDto): Promise<TxResult<MarkVotedResult>> {
    const v = await validateInput(VoterKeyDto, input);
    return this.fabric.submit<MarkVotedResult>('voters', 'MarkVoted', [v.electionId, v.voterHash]);
  }

  /** A batch with problem voters still succeeds: the caller MUST inspect data.rejected. */
  async markVotedBatch(input: VoterBatchDto): Promise<TxResult<MarkVotedResult>> {
    const v = await validateInput(VoterBatchDto, input);
    return this.fabric.submit<MarkVotedResult>('voters', 'MarkVotedBatch', [
      v.electionId,
      JSON.stringify(v.voterHashes),
    ]);
  }
}
