import { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectionEntity } from '../../domain/entities/election.entity';
import { ElectionNotFoundError } from '../../domain/errors/election-not-found.error';
import { ElectionNotEditableError } from '../../domain/errors/election-not-editable.error';
import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';
import {
  assertElectionInterval,
  parseElectionDate,
  parseElectionTime,
} from '../election-date.util';
import type { UpdateElectionDto } from '../dtos/update-election.dto';

export class UpdateElectionUseCase {
  constructor(
    private readonly elections: ElectionRepository,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(
    id: string,
    dto: UpdateElectionDto,
    requestingUserId: string,
  ): Promise<ElectionEntity> {
    const election = await this.elections.findById(id);
    if (!election) throw new ElectionNotFoundError(id);

    // Only elections in the editable (pending/initial) lifecycle state may be modified.
    if (!election.isEditable()) throw new ElectionNotEditableError();

    const startDate = parseElectionDate(dto.startDate);
    const startTime = parseElectionTime(dto.startTime);
    const endDate = parseElectionDate(dto.endDate);
    const endTime = parseElectionTime(dto.endTime);

    // Validate the COMPLETE supplied interval (all date/time fields are required for PUT),
    // so a complete update cannot produce an invalid or reversed range.
    assertElectionInterval(startDate, startTime, endDate, endTime);

    election.update({
      name: dto.name,
      description: dto.description,
      startDate,
      startTime,
      endDate,
      endTime,
      ...(dto.blankVoteEnabled !== undefined ? { blankVoteEnabled: dto.blankVoteEnabled } : {}),
    });

    const updated = await this.elections.update(election);

    if (requestingUserId) {
      await this.audit.log('ELECTION_UPDATED', requestingUserId, { electionId: updated.id });
    }

    return updated;
  }
}
