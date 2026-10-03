import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import type {
  ElectorEntity,
  UpdateElectorInput,
} from 'src/modules/electors/domain/entities/elector.entity';
import { ElectorNotFoundError } from 'src/modules/electors/domain/errors/elector-not-found.error';
import type { ElectorRepository } from 'src/modules/electors/domain/repositories/elector.repository.interface';
import { ElectionNotModifiableError } from '../../domain/errors/election-not-modifiable.error';
import { ElectoralRollNotFoundError } from '../../domain/errors/electoral-roll-not-found.error';
import type { ElectoralRollRepository } from '../../domain/repositories/electoral-roll.repository.interface';

export const UPDATE_ELECTORAL_ROLL_ELECTOR_AUDIT_ACTION = 'ELECTORAL_ROLL_ELECTOR_UPDATED';

export class UpdateElectoralRollElectorUseCase {
  constructor(
    private readonly electionRepo: ElectionRepository,
    private readonly electorRepo: ElectorRepository,
    private readonly electoralRollRepo: ElectoralRollRepository,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(input: {
    electionId: string;
    electorId: string;
    data: UpdateElectorInput;
    requestingUserId: string;
  }): Promise<ElectorEntity> {
    const { electionId, electorId, data, requestingUserId } = input;

    // 1. Election must exist (404).
    const election = await this.electionRepo.findById(electionId);
    if (!election) throw new ElectionNotFoundError(electionId);

    // 2. Election must be PENDING (409). Enforced here, not in the controller,
    //    so the rule holds from any entry point.
    if (!election.isRollModifiable()) throw new ElectionNotModifiableError();

    // 3. Elector must exist (404).
    const elector = await this.electorRepo.findById(electorId);
    if (!elector) throw new ElectorNotFoundError(electorId);

    // 4. Elector must belong to this election's roll (404). Scoped lookup
    //    guarantees we never update an unrelated elector.
    const rolls = await this.electoralRollRepo.findByElectionAndElectorIds(electionId, [electorId]);
    if (rolls.length === 0) throw new ElectoralRollNotFoundError(electionId, electorId);

    // 5. Apply partial update (entity owns the rules), persist, audit.
    elector.update(data);
    const updated = await this.electorRepo.update(elector);
    if (!updated) throw new ElectorNotFoundError(electorId); // race: row vanished

    await this.audit.log(UPDATE_ELECTORAL_ROLL_ELECTOR_AUDIT_ACTION, requestingUserId, {
      electionId,
      electorId,
    });

    return updated;
  }
}
