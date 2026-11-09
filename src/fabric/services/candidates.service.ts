import { Injectable } from '@nestjs/common';
import { FabricInvoker } from '../client/fabric-invoker';
import { validateInput } from '../dto/validate';
import { CandidateKeyDto, ElectionIdDto, RegisterCandidateDto } from '../dto/inputs';
import { Candidate, ReadOptions, TxResult } from '../types';

@Injectable()
export class CandidatesService {
  constructor(private readonly fabric: FabricInvoker) { }

  async registerCandidate(input: RegisterCandidateDto): Promise<TxResult<Candidate>> {
    const v = await validateInput(RegisterCandidateDto, input);
    return this.fabric.submit<Candidate>('candidates', 'RegisterCandidate', [
      v.electionId,
      v.candidateId,
      v.name,
    ]);
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
