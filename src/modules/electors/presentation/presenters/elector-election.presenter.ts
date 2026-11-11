import { ElectionPresenter } from 'src/modules/elections/presentation/presenters/election.presenter';
import type { ElectionEntity } from 'src/modules/elections/domain/entities/election.entity';
import type { ElectionStatusHistoryEntry } from 'src/modules/elections/domain/repositories/election.repository.interface';
import type { CandidacyWithCandidate } from 'src/modules/candidacies/domain/repositories/candidacy.repository.interface';
import { ElectorElectionDetailResponseDto } from '../dtos/elector-election-detail-response.dto';

export class ElectorElectionPresenter {
  static toDetail(item: {
    election: ElectionEntity;
    statusHistory: ElectionStatusHistoryEntry[];
    candidacies: CandidacyWithCandidate[];
    registeredVoters: number;
    hasVoted: boolean;
    participationDate: Date | null;
  }): ElectorElectionDetailResponseDto {
    return new ElectorElectionDetailResponseDto({
      // Reuse the full election-detail mapping so base and nested fields stay
      // identical to the admin detail endpoint.
      ...ElectionPresenter.toDetail(item),
      hasVoted: item.hasVoted,
      participationDate: item.participationDate?.toISOString() ?? null,
    });
  }
}
