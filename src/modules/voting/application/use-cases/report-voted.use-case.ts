import { Injectable, NotFoundException, Inject } from '@nestjs/common';

import {
  type VoteCredentialRepository,
  VOTE_CREDENTIAL_REPOSITORY,
} from '../../domain/repositories/vote-credential.repository';

@Injectable()
export class ReportVotedUseCase {
  constructor(
    @Inject(VOTE_CREDENTIAL_REPOSITORY)
    private readonly voteCredentialRepository: VoteCredentialRepository,
  ) {}

  async execute(electorId: string, electionId: string) {
    const c = await this.voteCredentialRepository.find(electionId, electorId);
    if (!c) throw new NotFoundException({ code: 'NO_SIGNATURE_ISSUED' });
    await this.voteCredentialRepository.report(electionId, electorId);
  }
}
