import { Inject, Injectable } from '@nestjs/common';
import { VotersService } from 'src/fabric/services/voters.service';
import { VOTER_HASHER_PORT, type VoterHasherPort } from 'src/shared/domain/ports/voter-hasher.port';
import type {
  VoterParticipationInput,
  VoterParticipationPort,
} from '../../application/ports/voter-participation.port';

// FabricError is not caught: FabricExceptionFilter maps it (e.g. 503 FABRIC_UNAVAILABLE).
@Injectable()
export class FabricVoterParticipationAdapter implements VoterParticipationPort {
  constructor(
    private readonly voters: VotersService,
    @Inject(VOTER_HASHER_PORT) private readonly hasher: VoterHasherPort,
  ) {}

  async hasConfirmedVote({ electionId, electorId }: VoterParticipationInput): Promise<boolean> {
    const voterHash = await this.hasher.hash({ electionId, electorId });
    const { status } = await this.voters.getVoterStatus({ electionId, voterHash });
    return status === 'VOTED';
  }
}
