import type {
  ElectorRepository,
  ElectorSearchResult,
  ElectorSearchParams,
} from '../../domain/repositories/elector.repository.interface';

export class SearchElectorsUseCase {
  constructor(private readonly electors: ElectorRepository) {}

  async execute(params: ElectorSearchParams): Promise<ElectorSearchResult> {
    const page = Number.isFinite(params.page) && params.page > 0 ? params.page : 1;
    const limit = Number.isFinite(params.limit) && params.limit > 0 ? params.limit : 10;

    return this.electors.search({
      page,
      limit,
      ...(params.programCode ? { programCode: params.programCode } : {}),
      ...(params.studentCode ? { studentCode: params.studentCode } : {}),
      ...(params.name ? { name: params.name } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.identification ? { identification: params.identification } : {}),
    });
  }
}
