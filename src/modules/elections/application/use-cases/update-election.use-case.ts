import { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectionEntity, type UpdateElectionInput } from '../../domain/entities/election.entity';
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

    const input: UpdateElectionInput = {};
    if (dto.name !== undefined) input.name = dto.name;
    if (dto.description !== undefined) input.description = dto.description;
    if (dto.startDate !== undefined) input.startDate = parseElectionDate(dto.startDate);
    if (dto.startTime !== undefined) input.startTime = parseElectionTime(dto.startTime);
    if (dto.endDate !== undefined) input.endDate = parseElectionDate(dto.endDate);
    if (dto.endTime !== undefined) input.endTime = parseElectionTime(dto.endTime);
    if (dto.blankVoteEnabled !== undefined) input.blankVoteEnabled = dto.blankVoteEnabled;

    // Validate the COMPLETE resulting election interval (merge of existing + incoming),
    // so partial date/time updates cannot produce an invalid or reversed range.
    const effectiveStart = input.startDate ?? election.startDate;
    const effectiveStartTime = input.startTime ?? election.startTime;
    const effectiveEnd = input.endDate ?? election.endDate;
    const effectiveEndTime = input.endTime ?? election.endTime;
    assertElectionInterval(effectiveStart, effectiveStartTime, effectiveEnd, effectiveEndTime);

    election.update(input);

    const updated = await this.elections.update(election);

    if (requestingUserId) {
      await this.audit.log('ELECTION_UPDATED', requestingUserId, { electionId: updated.id });
    }

    return updated;
  }
}
