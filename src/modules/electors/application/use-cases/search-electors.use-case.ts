import { ElectorEntity } from '../../domain/entities/elector.entity';
import type { ElectorRepository } from '../../domain/repositories/elector.repository.interface';

export interface SearchElectorsParams {
  page: number;
  limit: number;
  programCode?: string;
  studentCode?: string;
  name?: string;
}

export class SearchElectorsUseCase {
  constructor(private readonly electors: ElectorRepository) {}

  async execute(
    params: SearchElectorsParams,
  ): Promise<{ electors: ElectorEntity[]; total: number }> {
    const page = Number.isFinite(params.page) && params.page > 0 ? params.page : 1;
    const limit = Number.isFinite(params.limit) && params.limit > 0 ? params.limit : 10;
    const programCode = params.programCode?.trim() || undefined;
    const studentCode = params.studentCode?.trim() || undefined;
    const name = params.name?.trim() || undefined;

    return this.electors.findAll({ page, limit, programCode, studentCode, name });
  }
}
