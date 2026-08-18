import { ElectorNotFoundError } from '../../domain/errors/elector-not-found.error';
import type { ElectorRepository } from '../../domain/repositories/elector.repository.interface';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';

export class DeactivateElectorUseCase {
  constructor(
    private readonly electors: ElectorRepository,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(id: string, requestingUserId: string): Promise<void> {
    const elector = await this.electors.findById(id);
    if (!elector) throw new ElectorNotFoundError(id);

    elector.deactivate();

    const updated = await this.electors.updateStatus(id, elector.status);
    if (!updated) throw new ElectorNotFoundError(id);

    await this.audit.log('ELECTOR_DEACTIVATED', requestingUserId, { electorId: id });
  }
}
