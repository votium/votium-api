import {
  ElectorElectionParticipation,
  ElectorRepository,
} from '../../domain/repositories/elector.repository.interface';
import { ElectorEntity } from '../../domain/entities/elector.entity';
import { ElectorNotFoundError } from '../../domain/errors/elector-not-found.error';

export class GetElectorUseCase {
  constructor(private readonly electors: ElectorRepository) {}

  async execute(id: string): Promise<{
    elector: ElectorEntity;
    participation: ElectorElectionParticipation[];
  }> {
    const elector = await this.electors.findById(id);
    if (!elector) throw new ElectorNotFoundError(id);

    const participation = await this.electors.findElectionParticipation(id);
    return { elector, participation };
  }
}
