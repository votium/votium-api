import { Injectable } from '@nestjs/common';
import { FabricInvoker } from '../client/fabric-invoker';
import { VoterBatchDto, VoterKeyDto } from '../dto/inputs';
import { validateInput } from '../dto/validate';
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
  constructor(private readonly fabric: FabricInvoker) {}

  /** Idempotent: voters already loaded are skipped, so it is resent once after an unknown outcome. */
  async registerVoters(input: VoterBatchDto): Promise<TxResult<RegisterVotersResult>> {
    const v = await validateInput(VoterBatchDto, input);
    return this.fabric.submit<RegisterVotersResult>(
      'voters',
      'RegisterVoters',
      [v.electionId, JSON.stringify(v.voterHashes)],
      { idempotent: true },
    );
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

  /**
   * NEVER resent after an unknown outcome (FABRIC_OUTCOME_UNKNOWN). The caller must read getVoterStatus first.
   * If tokenActive is true and no signature was produced, do not sign "just in case": tell the voter to retry
   * after the token expires. A signature without a confirmed reservation would allow a second one later.
   */
  async issueToken(input: VoterKeyDto): Promise<TxResult<IssueTokenResult>> {
    const v = await validateInput(VoterKeyDto, input);
    return this.fabric.submit<IssueTokenResult>('voters', 'IssueToken', [
      v.electionId,
      v.voterHash,
    ]);
  }

  /** Idempotent by contract: marking twice is a success (alreadyVoted). */
  async markVoted(input: VoterKeyDto): Promise<TxResult<MarkVotedResult>> {
    const v = await validateInput(VoterKeyDto, input);
    return this.fabric.submit<MarkVotedResult>('voters', 'MarkVoted', [v.electionId, v.voterHash], {
      idempotent: true,
    });
  }

  /** A batch with problem voters still succeeds: the caller MUST inspect data.rejected. */
  async markVotedBatch(input: VoterBatchDto): Promise<TxResult<MarkVotedResult>> {
    const v = await validateInput(VoterBatchDto, input);
    return this.fabric.submit<MarkVotedResult>(
      'voters',
      'MarkVotedBatch',
      [v.electionId, JSON.stringify(v.voterHashes)],
      { idempotent: true },
    );
  }
}
