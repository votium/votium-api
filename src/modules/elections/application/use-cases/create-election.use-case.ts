import { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { BadRequestException } from 'src/shared/exceptions/base/bad-request.exception';
import { ElectionEntity } from '../../domain/entities/election.entity';
import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';

export class CreateElectionUseCase {
  constructor(
    private readonly elections: ElectionRepository,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(input: {
    name: string;
    description: string;
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    blankVoteEnabled?: boolean;
    requestingUserId: string;
  }): Promise<ElectionEntity> {
    const start = this.combine(input.startDate, input.startTime);
    const end = this.combine(input.endDate, input.endTime);

    if (start.instant.getTime() >= end.instant.getTime()) {
      throw new BadRequestException(
        'Election end must be strictly after start.',
        'ELECTION_INVALID_DATE_RANGE',
      );
    }

    const entity = ElectionEntity.create({
      name: input.name,
      description: input.description,
      startDate: start.datePart,
      startTime: start.timePart,
      endDate: end.datePart,
      endTime: end.timePart,
      blankVoteEnabled: input.blankVoteEnabled,
    });

    const saved = await this.elections.create(entity);

    if (input.requestingUserId) {
      await this.audit.log('ELECTION_CREATED', input.requestingUserId, {
        electionId: saved.id,
      });
    }

    return saved;
  }

  // Combines a calendar date and a time-of-day into:
  //  - datePart: Date carrying the calendar date (UTC midnight) for @db.Date
  //  - timePart: Date carrying the time of day (epoch) for @db.Time
  //  - instant:  Date carrying the combined value, used for range comparison
  // All values use UTC components so comparison is deterministic and DST-safe.
  private combine(
    dateStr: string,
    timeStr: string,
  ): { datePart: Date; timePart: Date; instant: Date } {
    const [y, m, d] = dateStr.split('-').map(Number);
    const [hhRaw, mmRaw, ssRaw] = timeStr.split(':');
    const hh = Number(hhRaw);
    const mm = Number(mmRaw);
    const ss = ssRaw !== undefined ? Number(ssRaw) : 0;

    const datePart = new Date(Date.UTC(y, m - 1, d));
    const timePart = new Date(Date.UTC(1970, 0, 1, hh, mm, ss));
    const instant = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));

    if (
      datePart.getUTCFullYear() !== y ||
      datePart.getUTCMonth() !== m - 1 ||
      datePart.getUTCDate() !== d
    ) {
      throw new BadRequestException(`Invalid calendar date: ${dateStr}`, 'ELECTION_INVALID_DATE');
    }
    if (
      timePart.getUTCHours() !== hh ||
      timePart.getUTCMinutes() !== mm ||
      timePart.getUTCSeconds() !== ss
    ) {
      throw new BadRequestException(`Invalid time: ${timeStr}`, 'ELECTION_INVALID_TIME');
    }

    return { datePart, timePart, instant };
  }
}
