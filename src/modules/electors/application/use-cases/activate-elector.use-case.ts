import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectorEntity } from '../../domain/entities/elector.entity';
import { ElectorNotFoundError } from '../../domain/errors/elector-not-found.error';
import type { ElectorRepository } from '../../domain/repositories/elector.repository.interface';

export class ActivateElectorUseCase {
  constructor(
    private readonly electors: ElectorRepository,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(id: string, requestingUserId: string): Promise<ElectorEntity> {
    const elector = await this.electors.findById(id);
    if (!elector) throw new ElectorNotFoundError(id);

    if (elector.isActive()) return elector; // idempotent no-op, no audit

    const updated = await this.electors.updateStatus(id, ElectorEntity.DEFAULT_STATUS);
    if (!updated) throw new ElectorNotFoundError(id);

    await this.audit.log('ELECTOR_ACTIVATED', requestingUserId, { electorId: id });

    return updated;
  }
}
