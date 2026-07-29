export class PaginatedResponseDto<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };

  constructor(params: { data: T[]; total: number; page: number; limit: number }) {
    this.data = params.data;
    this.meta = {
      page: params.page,
      limit: params.limit,
      total: params.total,
      totalPages: Math.ceil(params.total / params.limit),
    };
  }
}
