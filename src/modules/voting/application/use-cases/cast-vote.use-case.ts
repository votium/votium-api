import { Injectable, BadRequestException } from '@nestjs/common';
import { SignerPort } from '../ports/signer.port';
import { VoteProcessingPort } from '../ports/vote-processing.port';

@Injectable()
export class CastVoteUseCase {
  constructor(
    private readonly signer: SignerPort,
    private readonly voteProcessing: VoteProcessingPort,
  ) {}

  async execute(input: {
    electionId: string;
    candidateId: string;
    nullifier: string;
    signature: string;
  }): Promise<{ accepted: boolean; txId: string; recovered: boolean }> {
    const pub = await this.voteProcessing.getElection(input.electionId);
    if (
      !(await this.signer.verify(
        pub.electionId,
        pub.signingPublicKey,
        input.nullifier,
        input.signature,
      ))
    ) {
      throw new BadRequestException({
        code: 'INVALID_SIGNATURE',
        message: 'The provided signature is invalid.',
      });
    }

    const r = await this.voteProcessing.castVote(input);
    return { accepted: true, txId: r.txId, recovered: r.recovered ?? false };
  }
}
