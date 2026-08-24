import { ElectionEntity } from '../../domain/entities/election.entity';
import { ElectionResponseDto } from '../dtos/election-response.dto';

export class ElectionPresenter {
  static toResponse(entity: ElectionEntity): ElectionResponseDto {
    return new ElectionResponseDto({
      id: entity.id as string,
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
