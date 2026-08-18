import type {
  ElectorRepository,
  ElectorSearchResult,
} from '../../domain/repositories/elector.repository.interface';

export class SearchElectorsUseCase {
  constructor(private readonly electors: ElectorRepository) {}

  async execute(params: {
    page: number;
    limit: number;
    programCode?: string;
    studentCode?: string;
    name?: string;
  }): Promise<ElectorSearchResult> {
    const page = Number.isFinite(params.page) && params.page > 0 ? params.page : 1;
    const limit = Number.isFinite(params.limit) && params.limit > 0 ? params.limit : 10;

    return this.electors.search({
      page,
      limit,
      programCode: params.programCode,
      studentCode: params.studentCode,
      name: params.name,
    });
  }
}
