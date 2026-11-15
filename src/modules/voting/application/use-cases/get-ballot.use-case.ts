import { Injectable, NotFoundException } from '@nestjs/common';
import { BallotCandidateReader } from '../../domain/repositories/ballot-candidate.reader';
import { VoteProcessingPort } from '../ports/vote-processing.port';

export interface BallotCandidateView {
  candidateId: string;
  name: string;
  photoUrl: string | null;
  position: string;
}

export interface BallotView {
  electionId: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  signingPublicKey: string;
  messageFormat: string;
  candidates: BallotCandidateView[];
}

const TTL_MS = 30_000;

@Injectable()
export class GetBallotUseCase {
  private cache = new Map<string, { exp: number; value: BallotView }>();

  constructor(
    private readonly voteProcessing: VoteProcessingPort,
    private readonly extras: BallotCandidateReader,
  ) {}

  async execute(electionId: string): Promise<BallotView> {
    const hit = this.cache.get(electionId);
    if (hit && hit.exp > Date.now()) return hit.value;

    const election = await this.voteProcessing.getElection(electionId).catch((e: any) => {
      if (e?.code === 'NOT_FOUND') throw new NotFoundException({ code: 'ELECTION_NOT_FOUND' });
      throw e;
    });
    const [onLedger, extras] = await Promise.all([
      this.voteProcessing.listCandidates(electionId),
      this.extras.findByElection(electionId),
    ]);
    const extraById = new Map(extras.map((x) => [x.candidateId, x]));

    const candidates: BallotCandidateView[] = onLedger
      .map((c) => {
        const x = extraById.get(c.candidateId);
        return {
          candidateId: c.candidateId,
          name: c.name,
          photoUrl: x?.photoUrl ?? null,
          position: x?.position ?? '0', // Default position if not found
        };
      })
      .sort((a, b) => a.position.localeCompare(b.position));

    const value: BallotView = {
      electionId: election.electionId,
      name: election.name,
      status: election.status,
      startDate: election.startDate,
      endDate: election.endDate,
      signingPublicKey: election.signingPublicKey,
      messageFormat: 'votium|v1|<electionId>|<nullifier>',
      candidates,
    };
    this.cache.set(electionId, { exp: Date.now() + TTL_MS, value });

    return value;
  }
}
