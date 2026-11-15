// modules/vote-processing/application/use-cases/get-signature-status.use-case.ts
import { Inject, Injectable } from '@nestjs/common';

import {
  type VoteCredentialRepository,
  VOTE_CREDENTIAL_REPOSITORY,
} from '../../domain/repositories/vote-credential.repository';
import { type VoterHasherPort, VOTER_HASHER_PORT } from 'src/shared/domain/ports/voter-hasher.port';
import { VoteProcessingPort } from '../ports/vote-processing.port';

export type SignatureState =
  | 'NOT_ELIGIBLE'
  | 'ELECTION_NOT_ACTIVE'
  | 'CAN_REQUEST'
  | 'TOKEN_PENDING'
  | 'SIGNATURE_DELIVERED'
  | 'VOTE_REPORTED'
  | 'ALREADY_VOTED';

@Injectable()
export class GetSignatureStatusUseCase {
  constructor(
    @Inject(VOTE_CREDENTIAL_REPOSITORY)
    private readonly creds: VoteCredentialRepository,
    @Inject(VOTER_HASHER_PORT)
    private readonly hasher: VoterHasherPort,
    private readonly voteProcessing: VoteProcessingPort,
  ) {}

  async execute(
    electorId: string,
    electionId: string,
  ): Promise<{ state: SignatureState; retryAfter?: string }> {
    // 1. Postgres primero: si ya se entregó firma, no hace falta consultar la red
    const cred = await this.creds.find(electionId, electorId);
    if (cred) {
      return { state: cred.status === 'NONE' ? 'SIGNATURE_DELIVERED' : 'VOTE_REPORTED' };
    }

    // 2. Padrón en la red
    const voterHash = await this.hasher.hash({ electionId, electorId });
    const st = await this.voteProcessing.getVoterStatus({ electionId, voterHash });
    if (st.status === 'NOT_FOUND') return { state: 'NOT_ELIGIBLE' };
    if (st.status === 'VOTED') return { state: 'ALREADY_VOTED' };

    // 3. GetVoterStatus no comprueba el estado de la elección: se verifica aquí
    const election = await this.voteProcessing.getElection(electionId);
    if (election.status !== 'ACTIVE') return { state: 'ELECTION_NOT_ACTIVE' };

    if (st.tokenActive) return { state: 'TOKEN_PENDING', retryAfter: st.tokenExpiresAt };
    return { state: 'CAN_REQUEST' };
  }
}
