import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectorNotFoundError } from 'src/modules/electors/domain/errors/elector-not-found.error';
import type { ElectorRepository } from 'src/modules/electors/domain/repositories/elector.repository.interface';
import { ElectionNotModifiableError } from '../../domain/errors/election-not-modifiable.error';
import { ElectoralRollNotFoundError } from '../../domain/errors/electoral-roll-not-found.error';
import type { ElectoralRollRepository } from '../../domain/repositories/electoral-roll.repository.interface';

export const REMOVE_ELECTORAL_ROLL_ELECTOR_AUDIT_ACTION = 'ELECTORAL_ROLL_ELECTOR_REMOVED';

export class RemoveElectorFromElectoralRollUseCase {
  constructor(
    private readonly electionRepo: ElectionRepository,
    private readonly electorRepo: ElectorRepository,
    private readonly electoralRollRepo: ElectoralRollRepository,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(input: {
    electionId: string;
    electorId: string;
    requestingUserId: string;
  }): Promise<void> {
    const { electionId, electorId, requestingUserId } = input;

    // 1. Election must exist (404).
    const election = await this.electionRepo.findById(electionId);
    if (!election) throw new ElectionNotFoundError(electionId);

    // 2. Election must be PENDING (409). Enforced here, not in the controller,
    //    so the rule holds from any entry point.
    if (!election.isRollModifiable()) throw new ElectionNotModifiableError();

    // 3. Elector must exist (404) — satisfies the spec's explicit existence rule
    //    and disambiguates ELECTOR_NOT_FOUND from ELECTORAL_ROLL_NOT_FOUND.
    const elector = await this.electorRepo.findById(electorId);
    if (!elector) throw new ElectorNotFoundError(electorId);

    // 4. Association must exist and is deleted with a composite-scoped operation
    //    (never removes the elector from another election, never deletes the row).
    const deleted = await this.electoralRollRepo.deleteByElectionAndElectorId(
      electionId,
      electorId,
    );
    if (!deleted) throw new ElectoralRollNotFoundError(electionId, electorId);

    await this.audit.log(REMOVE_ELECTORAL_ROLL_ELECTOR_AUDIT_ACTION, requestingUserId, {
      electionId,
      electorId,
    });
  }
}
