import { CandidacyPresenter } from 'src/modules/candidacies/presentation/presenters/candidacy.presenter';
import type { CandidacyWithCandidate } from 'src/modules/candidacies/domain/repositories/candidacy.repository.interface';
import { ElectionDetailResult } from '../../application/use-cases/get-election-detail.use-case';
import { ElectionEntity } from '../../domain/entities/election.entity';
import type { ElectionStatusHistoryEntry } from '../../domain/repositories/election.repository.interface';
import {
  ElectionDetailResponseDto,
  ElectionStatusHistoryEntryResponseDto,
} from '../dtos/election-detail-response.dto';
import { ElectionResponseDto } from '../dtos/election-response.dto';
import { VoterElectionDetailResponseDto } from '../dtos/voter-election-detail-response.dto';

export class ElectionPresenter {
  static toResponse(entity: ElectionEntity): ElectionResponseDto {
    return new ElectionResponseDto({
      id: entity.id as string,
      electionCode: entity.electionCode,
      name: entity.name,
      description: entity.description,
      startDate: formatDate(entity.startDate),
      startTime: formatTime(entity.startTime),
      endDate: formatDate(entity.endDate),
      endTime: formatTime(entity.endTime),
      currentStatus: entity.currentStatus,
      blankVoteEnabled: entity.blankVoteEnabled,
      createdAt: entity.createdAt?.toISOString() ?? '',
    });
  }

  static toList(entities: ElectionEntity[]): ElectionResponseDto[] {
    return entities.map((entity) => ElectionPresenter.toResponse(entity));
  }

  static toDetail(result: ElectionDetailResult): ElectionDetailResponseDto {
    return new ElectionDetailResponseDto({
      ...ElectionPresenter.toResponse(result.election), // base fields (dates already formatted per project convention)
      statusHistory: result.statusHistory.map(
        (entry) =>
          new ElectionStatusHistoryEntryResponseDto({
            status: entry.status,
            timestamp: entry.timestamp.toISOString(),
          }),
      ),
      candidacies: result.candidacies.map((candidacy) =>
        CandidacyPresenter.toCandidacyWithCandidate(candidacy),
      ),
      registeredVoters: result.registeredVoters,
    });
  }

  static toVoterDetail(item: {
    election: ElectionEntity;
    statusHistory: ElectionStatusHistoryEntry[];
    candidacies: CandidacyWithCandidate[];
    registeredVoters: number;
    hasVoted: boolean;
    participationDate: Date | null;
  }): VoterElectionDetailResponseDto {
    return new VoterElectionDetailResponseDto({
      ...ElectionPresenter.toDetail(item), // reuse the full detail mapping
      hasVoted: item.hasVoted,
      participationDate: item.participationDate?.toISOString() ?? null,
    });
  }
}

function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatTime(date: Date): string {
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
