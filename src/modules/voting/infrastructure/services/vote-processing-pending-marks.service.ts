// modules/vote-processing/infrastructure/services/vote-processing-pending-marks.service.ts
import { Injectable, Inject } from '@nestjs/common';
import { PendingMarksPort } from 'src/modules/elections/application/ports/pending-marks.port';
import { FlushVoteMarksUseCase } from '../../application/use-cases/flush-vote-marks.use-case';
import {
  type VoteCredentialRepository,
  VOTE_CREDENTIAL_REPOSITORY,
} from '../../domain/repositories/vote-credential.repository';

@Injectable()
export class VoteProcessingPendingMarks extends PendingMarksPort {
  constructor(
    private readonly flushUseCase: FlushVoteMarksUseCase,
    @Inject(VOTE_CREDENTIAL_REPOSITORY) private readonly creds: VoteCredentialRepository,
  ) {
    super();
  }

  flush(electionId: string) {
    return this.flushUseCase.execute(electionId);
  }
  pending(electionId: string) {
    return this.creds.countReported(electionId);
  }
}
