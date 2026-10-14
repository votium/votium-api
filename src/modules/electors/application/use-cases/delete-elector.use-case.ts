import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectorNotFoundError } from '../../domain/errors/elector-not-found.error';
import type { ElectorRepository } from '../../domain/repositories/elector.repository.interface';

export class DeleteElectorUseCase {
  constructor(
    private readonly electors: ElectorRepository,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(id: string, requestingUserId: string): Promise<void> {
    const elector = await this.electors.findById(id);
    if (!elector) throw new ElectorNotFoundError(id);

    elector.delete();

    const deleted = await this.electors.softDelete(id);
    if (!deleted) throw new ElectorNotFoundError(id);

    if (requestingUserId) {
      await this.audit.log('ELECTOR_DELETED', requestingUserId, { electorId: id });
    }
  }
}
