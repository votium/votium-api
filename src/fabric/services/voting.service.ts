import { Injectable } from '@nestjs/common';
import { FabricInvoker } from '../client/fabric-invoker';
import { CastVoteDto, ElectionIdDto, VotesQueryDto } from '../dto/inputs';
import { validateInput } from '../dto/validate';
import { CastVoteResult, ReadOptions, Tally, TxResult, VotesPage } from '../types';

const DEFAULT_PAGE_SIZE = 200; // documented default of the contract

@Injectable()
export class VotingService {
  constructor(private readonly fabric: FabricInvoker) { }

  /**
   * After an unknown outcome the same vote (same nullifier) is sent once more. If the network answers
   * NULLIFIER_USED, the first attempt was applied: the result is returned with recovered=true.
   */
  async castVote(input: CastVoteDto): Promise<TxResult<CastVoteResult>> {
    const v = await validateInput(CastVoteDto, input);
    return this.fabric.submit<CastVoteResult>(
      'voting',
      'CastVote',
      [v.electionId, v.candidateId, v.nullifier, v.signature],
      {
        idempotent: true,
        recoverFromError: (err) =>
          err.code === 'NULLIFIER_USED'
            ? { electionId: v.electionId, nullifier: v.nullifier, accepted: true }
            : undefined,
      },
    );
  }

  async getVotesByElection(input: VotesQueryDto, opts: ReadOptions = {}): Promise<VotesPage> {
    const v = await validateInput(VotesQueryDto, input);
    // The contract always receives the three arguments: pageSize (documented default 200) and an empty bookmark for the first page.
    const args = [v.electionId, String(v.pageSize ?? DEFAULT_PAGE_SIZE), v.bookmark ?? ''];
    return this.fabric.evaluate<VotesPage>('voting', 'GetVotesByElection', args, opts.profile);
  }

  async getTally(electionId: string, opts: ReadOptions = {}): Promise<Tally> {
    const v = await validateInput(ElectionIdDto, { electionId });
    return this.fabric.evaluate<Tally>('voting', 'GetTally', [v.electionId], opts.profile);
  }
}
