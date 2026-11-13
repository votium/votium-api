import { Injectable } from '@nestjs/common';
import { ElectionCandidatesPort, CandidacyDto } from '../../domain/ports/election-candidates.port';
import { CandidaciesPublicService } from 'src/modules/candidacies/application/services/candidacies-public.service';
import { CandidacyPublicDto } from 'src/modules/candidacies/application/dtos/candidacy-public.dto';

@Injectable()
export class CandidaciesModuleAdapter implements ElectionCandidatesPort {
  constructor(private readonly candidaciesPublicService: CandidaciesPublicService) {}

  async getCandidaciesByElection(electionId: string): Promise<CandidacyDto[]> {
    const candidacies: CandidacyPublicDto[] =
      await this.candidaciesPublicService.getCandidaciesByElection(electionId);
    return candidacies.map((c) => ({
      id: c.id,
      positionNumber: c.positionNumber,
      election: {
        id: c.election?.id ?? '',
      },
      candidate: {
        id: c.candidate.id,
        name: c.candidate.name,
      },
    }));
  }
}
