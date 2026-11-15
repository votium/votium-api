import { Injectable, Inject } from '@nestjs/common';
import {
  type CandidacyRepository,
  CANDIDACY_REPOSITORY,
} from '../../domain/repositories/candidacy.repository.interface';
import { CandidacyPublicDto } from '../dtos/candidacy-public.dto';

@Injectable()
export class CandidaciesPublicService {
  constructor(
    @Inject(CANDIDACY_REPOSITORY)
    private readonly candidacyRepo: CandidacyRepository,
  ) {}

  async getCandidaciesByElection(electionId: string): Promise<CandidacyPublicDto[]> {
    const candidacies = await this.candidacyRepo.findByElection(electionId);
    return candidacies.map((c) => ({
      id: c.id,
      positionNumber: c.positionNumber,
      candidate: {
        id: c.candidateId,
        name: c.candidateFirstName + ' ' + c.candidateLastName,
        email: null,
        studentCode: null,
        status: null,
      },
      election: {
        id: c.electionId,
        name: null,
        startDate: null,
        endDate: null,
        startTime: null,
        endTime: null,
        status: null,
        signingPublicKey: null,
      },
    }));
  }
}
