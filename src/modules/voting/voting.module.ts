import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { CandidaciesModule } from 'src/modules/candidacies/candidacies.module';
import { IamModule } from 'src/modules/iam/iam.module';

import { VotingController } from './presentation/controllers/voting.controller';
import { Sha256VoterHasherService } from 'src/shared/infrastructure/crypto/sha256-voter-hasher.service';
import { VOTER_HASHER_PORT } from 'src/shared/domain/ports/voter-hasher.port';

import {
  CastVoteUseCase,
  FlushVoteMarksUseCase,
  GetBallotUseCase,
  GetSignatureStatusUseCase,
  ReportVotedUseCase,
  RequestBlindSignatureUseCase,
} from './application/use-cases';

import { FabricVoteProcessingAdapter } from './infrastructure/adapters/fabric-vote-processing.adapter';
import { VoteProcessingPort } from './application/ports/vote-processing.port';
import { FabricModule } from 'src/fabric/fabric.module';
import { PrismaBallotCandidateReader } from './infrastructure/repositories/prisma-ballot-candidate.reader';
import { BallotCandidateReader } from './domain/repositories/ballot-candidate.reader';
import { PrismaVoteCredentialRepository } from './infrastructure/repositories/prisma-vote-credential.repository';
import { VOTE_CREDENTIAL_REPOSITORY } from './domain/repositories/vote-credential.repository';
import { VoteMarksJob } from './infrastructure/jobs/vote-marks.job';
import { VoteProcessingPendingMarks } from './infrastructure/services/vote-processing-pending-marks.service';
import { PendingMarksPort } from '../elections/application/ports/pending-marks.port';
import { SharedModule } from 'src/shared/shared.module';
import { SignerPort } from './application/ports/signer.port';
import { BlindSignatureService } from 'src/shared/blind-signature/blind-signature.service';
import { BlindSignatureModule } from 'src/shared/blind-signature/blind-signature.module';
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    IamModule,
    AuthModule,
    forwardRef(() => CandidaciesModule),
    FabricModule,
    SharedModule,
    BlindSignatureModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
  ],
  controllers: [VotingController],
  providers: [
    CastVoteUseCase,
    FlushVoteMarksUseCase,
    GetBallotUseCase,
    GetSignatureStatusUseCase,
    ReportVotedUseCase,
    RequestBlindSignatureUseCase,
    Sha256VoterHasherService,
    FabricVoteProcessingAdapter,
    PrismaBallotCandidateReader,
    PrismaVoteCredentialRepository,
    VoteMarksJob,
    BlindSignatureService,
    { provide: VOTER_HASHER_PORT, useClass: Sha256VoterHasherService },
    { provide: VoteProcessingPort, useClass: FabricVoteProcessingAdapter },
    { provide: BallotCandidateReader, useClass: PrismaBallotCandidateReader },
    { provide: VOTE_CREDENTIAL_REPOSITORY, useClass: PrismaVoteCredentialRepository },
    { provide: PendingMarksPort, useClass: VoteProcessingPendingMarks },
    { provide: SignerPort, useClass: BlindSignatureService },
  ],
  exports: [PendingMarksPort],
})
export class VotingModule {}
