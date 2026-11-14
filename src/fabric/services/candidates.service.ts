import { Injectable } from '@nestjs/common';
import { FabricInvoker } from '../client/fabric-invoker';
import { CandidateKeyDto, ElectionIdDto, RegisterCandidateDto } from '../dto/inputs';
import { validateInput } from '../dto/validate';
import { Candidate, ReadOptions, TxResult } from '../types';

@Injectable()
export class CandidatesService {
  constructor(private readonly fabric: FabricInvoker) { }

  async registerCandidate(input: RegisterCandidateDto): Promise<TxResult<Candidate>> {
    const v = await validateInput(RegisterCandidateDto, input);
    return this.fabric.submit<Candidate>(
      'candidates',
      'RegisterCandidate',
      [v.electionId, v.candidateId, v.name],
      {
        // After an unknown outcome: the candidate exists with this name => the first attempt was applied.
        reconcile: async () => {
          try {
            const c = await this.getCandidate(v.electionId, v.candidateId);
            return c.name === v.name ? c : undefined;
          } catch {
            return undefined;
          }
        },
      },
    );
  }

  async getCandidate(
    electionId: string,
    candidateId: string,
    opts: ReadOptions = {},
  ): Promise<Candidate> {
    const v = await validateInput(CandidateKeyDto, { electionId, candidateId });
    return this.fabric.evaluate<Candidate>(
      'candidates',
      'GetCandidate',
      [v.electionId, v.candidateId],
      opts.profile,
    );
  }

  async listCandidates(electionId: string, opts: ReadOptions = {}): Promise<Candidate[]> {
    const v = await validateInput(ElectionIdDto, { electionId });
    return this.fabric.evaluate<Candidate[]>(
      'candidates',
      'ListCandidates',
      [v.electionId],
      opts.profile,
    );
  }
}
