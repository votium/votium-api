import { PaginatedResponseDto } from './paginated-response.dto';

describe('PaginatedResponseDto', () => {
  it('creates with data and meta', () => {
    const dto = new PaginatedResponseDto({
      data: ['a', 'b'],
      total: 10,
      page: 2,
      limit: 5,
    });

    expect(dto.data).toEqual(['a', 'b']);
    expect(dto.meta).toEqual({
      page: 2,
      limit: 5,
      total: 10,
      totalPages: 2,
    });
  });

  it('calculates totalPages rounding up', () => {
    const dto = new PaginatedResponseDto({
      data: [],
      total: 11,
      page: 1,
      limit: 5,
    });

    expect(dto.meta.totalPages).toBe(3);
  });

  it('handles empty data', () => {
    const dto = new PaginatedResponseDto({
      data: [],
      total: 0,
      page: 1,
      limit: 10,
    });

    expect(dto.data).toEqual([]);
    expect(dto.meta.totalPages).toBe(0);
  });

  it('handles single page', () => {
    const dto = new PaginatedResponseDto({
      data: [{ id: 1 }],
      total: 1,
      page: 1,
      limit: 10,
    });

    expect(dto.meta.totalPages).toBe(1);
  });
});
