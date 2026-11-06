import { Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { CandidaciesModule } from 'src/modules/candidacies/candidacies.module';
import {
  CANDIDACY_REPOSITORY,
  type CandidacyRepository,
} from 'src/modules/candidacies/domain/repositories/candidacy.repository.interface';
import { ElectionsModule } from 'src/modules/elections/elections.module';
import {
  ELECTION_REPOSITORY,
  type ElectionRepository,
} from 'src/modules/elections/domain/repositories/election.repository.interface';
import {
  ELECTORAL_ROLL_REPOSITORY,
  type ElectoralRollRepository,
} from 'src/modules/elections/domain/repositories/electoral-roll.repository.interface';
import { IamModule } from 'src/modules/iam/iam.module';
import { ElectionKeyProvisioner } from './application/election-key-provisioner';
import { CastAnonymousVoteUseCase } from './application/use-cases/cast-anonymous-vote.use-case';
import { GetAnonymousBallotReceiptUseCase } from './application/use-cases/get-anonymous-ballot-receipt.use-case';
import { GetAnonymousVotingResultsUseCase } from './application/use-cases/get-anonymous-voting-results.use-case';
import { GetBallotCredentialStatusUseCase } from './application/use-cases/get-ballot-credential-status.use-case';
import { GetBlindSignaturePublicKeyUseCase } from './application/use-cases/get-blind-signature-public-key.use-case';
import { IssueBallotCredentialUseCase } from './application/use-cases/issue-ballot-credential.use-case';
import {
  BLIND_SIGNATURE_PORT,
  type BlindSignaturePort,
} from './domain/crypto/blind-signature.port';
import { KEY_PROTECTION_PORT, type KeyProtectionPort } from './domain/crypto/key-protection.port';
import { PROOF_VERIFIER_PORT, type ProofVerifierPort } from './domain/crypto/proof-verifier.port';
import { RsaBssaBlindSignature } from './domain/crypto/rsabssa-blind-signature';
import { SchnorrRistrettoZkp } from './domain/crypto/schnorr-zkp';
import {
  ANONYMOUS_VOTING_REPOSITORY,
  type AnonymousVotingRepository,
} from './domain/repositories/anonymous-voting.repository.interface';
import { ElectionKeyCipher } from './infrastructure/crypto/election-key-cipher';
import { PrismaAnonymousVotingRepository } from './infrastructure/repositories/prisma-anonymous-voting.repository';
import { AnonymousVotingController } from './presentation/controllers/anonymous-voting.controller';

@Module({
  imports: [IamModule, AuthModule, ElectionsModule, CandidaciesModule],
  controllers: [AnonymousVotingController],
  providers: [
    { provide: ANONYMOUS_VOTING_REPOSITORY, useClass: PrismaAnonymousVotingRepository },
    { provide: BLIND_SIGNATURE_PORT, useClass: RsaBssaBlindSignature },
    { provide: KEY_PROTECTION_PORT, useClass: ElectionKeyCipher },
    { provide: PROOF_VERIFIER_PORT, useClass: SchnorrRistrettoZkp },
    {
      provide: ElectionKeyProvisioner,
      useFactory: (
        repo: AnonymousVotingRepository,
        signer: BlindSignaturePort,
        protection: KeyProtectionPort,
      ) => new ElectionKeyProvisioner(repo, signer, protection),
      inject: [ANONYMOUS_VOTING_REPOSITORY, BLIND_SIGNATURE_PORT, KEY_PROTECTION_PORT],
    },
    {
      provide: GetBlindSignaturePublicKeyUseCase,
      useFactory: (elections: ElectionRepository, keys: ElectionKeyProvisioner) =>
        new GetBlindSignaturePublicKeyUseCase(elections, keys),
      inject: [ELECTION_REPOSITORY, ElectionKeyProvisioner],
    },
    {
      provide: IssueBallotCredentialUseCase,
      useFactory: (
        elections: ElectionRepository,
        rolls: ElectoralRollRepository,
        repo: AnonymousVotingRepository,
        signer: BlindSignaturePort,
        protection: KeyProtectionPort,
        keys: ElectionKeyProvisioner,
      ) => new IssueBallotCredentialUseCase(elections, rolls, repo, signer, protection, keys),
      inject: [
        ELECTION_REPOSITORY,
        ELECTORAL_ROLL_REPOSITORY,
        ANONYMOUS_VOTING_REPOSITORY,
        BLIND_SIGNATURE_PORT,
        KEY_PROTECTION_PORT,
        ElectionKeyProvisioner,
      ],
    },
    {
      provide: GetBallotCredentialStatusUseCase,
      useFactory: (elections: ElectionRepository, repo: AnonymousVotingRepository) =>
        new GetBallotCredentialStatusUseCase(elections, repo),
      inject: [ELECTION_REPOSITORY, ANONYMOUS_VOTING_REPOSITORY],
    },
    {
      provide: CastAnonymousVoteUseCase,
      useFactory: (
        elections: ElectionRepository,
        candidacies: CandidacyRepository,
        repo: AnonymousVotingRepository,
        signer: BlindSignaturePort,
        verifier: ProofVerifierPort,
      ) => new CastAnonymousVoteUseCase(elections, candidacies, repo, signer, verifier),
      inject: [
        ELECTION_REPOSITORY,
        CANDIDACY_REPOSITORY,
        ANONYMOUS_VOTING_REPOSITORY,
        BLIND_SIGNATURE_PORT,
        PROOF_VERIFIER_PORT,
      ],
    },
    {
      provide: GetAnonymousBallotReceiptUseCase,
      useFactory: (elections: ElectionRepository, repo: AnonymousVotingRepository) =>
        new GetAnonymousBallotReceiptUseCase(elections, repo),
      inject: [ELECTION_REPOSITORY, ANONYMOUS_VOTING_REPOSITORY],
    },
    {
      provide: GetAnonymousVotingResultsUseCase,
      useFactory: (
        elections: ElectionRepository,
        candidacies: CandidacyRepository,
        repo: AnonymousVotingRepository,
      ) => new GetAnonymousVotingResultsUseCase(elections, candidacies, repo),
      inject: [ELECTION_REPOSITORY, CANDIDACY_REPOSITORY, ANONYMOUS_VOTING_REPOSITORY],
    },
  ],
})
export class AnonymousVotingModule {}
