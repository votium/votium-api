import { ElectorNotFoundError } from '../../domain/errors/elector-not-found.error';
import type { ElectorRepository } from '../../domain/repositories/elector.repository.interface';

export class GetMeElectorUseCase {
  constructor(private readonly electors: ElectorRepository) {}

  async execute(id: string) {
    const elector = await this.electors.findById(id);
    if (!elector) throw new ElectorNotFoundError(id);
    return elector;
  }
}
