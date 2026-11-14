import {
  Injectable,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';

import { createHash } from 'crypto';

import {
  VOTE_CREDENTIAL_REPOSITORY,
  type VoteCredentialRepository,
} from '../../domain/repositories/vote-credential.repository';
import { type VoterHasherPort, VOTER_HASHER_PORT } from 'src/shared/domain/ports/voter-hasher.port';
import { VoteProcessingPort } from '../ports/vote-processing.port';
import { SignerPort } from '../ports/signer.port';

@Injectable()
export class RequestBlindSignatureUseCase {
  constructor(
    @Inject(VOTE_CREDENTIAL_REPOSITORY)
    private readonly voteCredentialRepository: VoteCredentialRepository,
    @Inject(VOTER_HASHER_PORT)
    private readonly hasher: VoterHasherPort,
    private readonly voteProcessing: VoteProcessingPort,
    private readonly signer: SignerPort,
  ) {}

  async execute(
    electorId: string,
    electionId: string,
    blindedMessage: string,
  ): Promise<{ blindSignature: string }> {
    const bmHash = createHash('sha256').update(blindedMessage).digest('hex');

    const existing = await this.voteCredentialRepository.find(electionId, electorId);
    if (existing) {
      if (existing.blindedMessageHash === bmHash) {
        throw new ConflictException({
          code: 'SIGANATURE_ALREADY_ISSUED',
          message: 'A vote credential with the same signature already exists.',
        });
      }
      return { blindSignature: existing.blindSignature };
    }

    const voterHash = await this.hasher.hash({ electionId, electorId });
    const st = await this.voteProcessing.getVoterStatus({ electionId, voterHash });
    if (st.status === 'NOT_FOUND')
      throw new ForbiddenException({
        code: 'NOT_IN_ROLL',
        message: 'The voter is not registered for this election.',
      });
    if (st.status === 'VOTED')
      throw new ConflictException({
        code: 'ALREADY_VOTED',
        message: 'The voter has already voted in this election.',
      });
    if (st.tokenActive)
      throw new ConflictException({
        code: 'TOKEN_ACTIVE',
        retryAfter: st.tokenExpiresAt,
        message: 'The voter already has an active token for this election.',
      });

    await this.voteProcessing.issueToken({ electionId, voterHash });

    let blindSignature: string;
    try {
      blindSignature = await this.signer.signBlinded(electionId, blindedMessage);
    } catch {
      throw new BadRequestException({
        code: 'INVALID_BLINDED_MESSAGE',
        message: 'The provided blinded message is invalid.',
      });
    }

    await this.voteCredentialRepository.create({
      electionId,
      electorId,
      voterHash,
      blindedMessageHash: bmHash,
      blindSignature,
    });

    return { blindSignature };
  }
}
