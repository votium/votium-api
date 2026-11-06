import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectorEntity, UpdateElectorInput } from '../../domain/entities/elector.entity';
import { ElectorNotFoundError } from '../../domain/errors/elector-not-found.error';
import type { ElectorRepository } from '../../domain/repositories/elector.repository.interface';

export class UpdateElectorUseCase {
  constructor(
    private readonly electors: ElectorRepository,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(
    id: string,
    input: UpdateElectorInput,
    requestingUserId: string,
  ): Promise<ElectorEntity> {
    const elector = await this.electors.findById(id);
    if (!elector) throw new ElectorNotFoundError(id);

    elector.update(input);

    const updated = await this.electors.update(elector);
    if (!updated) throw new ElectorNotFoundError(id);

    if (requestingUserId) {
      await this.audit.log('ELECTOR_UPDATED', requestingUserId, { electorId: id });
    }

    return updated;
  }
}
