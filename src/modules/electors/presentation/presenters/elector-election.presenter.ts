import { ElectionPresenter } from 'src/modules/elections/presentation/presenters/election.presenter';
import type { ElectionEntity } from 'src/modules/elections/domain/entities/election.entity';
import type { ElectionStatusHistoryEntry } from 'src/modules/elections/domain/repositories/election.repository.interface';
import type { CandidacyWithCandidate } from 'src/modules/candidacies/domain/repositories/candidacy.repository.interface';
import type { VoterActiveParticipationResult } from '../../application/use-cases/get-voter-active-participation.use-case';
import { VoterParticipationResponseDto } from '../dtos/voter-participation-response.dto';
import type { VoterUpcomingElectionItem } from '../../application/use-cases/get-voter-upcoming-elections.use-case';
import { VoterUpcomingElectionResponseDto } from '../dtos/voter-upcoming-election-response.dto';
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

  static toUpcomingList(items: VoterUpcomingElectionItem[]): VoterUpcomingElectionResponseDto[] {
    return items.map(
      (item) =>
        new VoterUpcomingElectionResponseDto({
          ...ElectionPresenter.toResponse(item.election),
          participantsCount: item.participantsCount,
          registeredVotersCount: item.registeredVotersCount,
          participationPercentage: item.participationPercentage,
          hasVoted: item.hasVoted,
        }),
    );
  }

  static toParticipation(result: VoterActiveParticipationResult): VoterParticipationResponseDto {
    return new VoterParticipationResponseDto({
      participatedElections: result.participatedElections,
      activeElections: result.activeElections,
      participation: result.participation,
    });
  }
}
