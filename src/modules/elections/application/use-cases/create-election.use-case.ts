import { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectionEntity } from '../../domain/entities/election.entity';
import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';
import {
  assertElectionInterval,
  parseElectionDate,
  parseElectionTime,
} from '../election-date.util';

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
    const startDate = parseElectionDate(input.startDate);
    const startTime = parseElectionTime(input.startTime);
    const endDate = parseElectionDate(input.endDate);
    const endTime = parseElectionTime(input.endTime);

    assertElectionInterval(startDate, startTime, endDate, endTime);

    const entity = ElectionEntity.create({
      name: input.name,
      description: input.description,
      startDate,
      startTime,
      endDate,
      endTime,
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
}
