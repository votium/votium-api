import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ListElectoralRollElectorsQueryDto } from './list-electoral-roll-electors-query.dto';

describe('ListElectoralRollElectorsQueryDto', () => {
  function validate(input: Record<string, unknown>) {
    return validateSync(plainToInstance(ListElectoralRollElectorsQueryDto, input), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
  }

  it('LQ-01: accepts an empty query (defaults applied by the DTO)', () => {
    expect(validate({})).toHaveLength(0);
  });

  it('LQ-02: accepts valid page/limit integers', () => {
    expect(validate({ page: '2', limit: '25' })).toHaveLength(0);
  });

  it.each(['0', '-5', 'abc'])('LQ-03: rejects invalid page = %s', (page) => {
    const errors = validate({ page });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('page');
  });

  it.each(['0', '-5', 'abc'])('LQ-04: rejects invalid limit = %s', (limit) => {
    const errors = validate({ limit });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('limit');
  });

  it.each(['ACTIVE', 'INACTIVE'])('LQ-05: accepts status = %s', (status) => {
    expect(validate({ status })).toHaveLength(0);
  });

  it.each(['DELETED', 'foo', 'active', ''])('LQ-06: rejects status = %j', (status) => {
    const errors = validate({ status });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('status');
  });

  it('LQ-07: accepts all canonical filters', () => {
    const errors = validate({
      page: '1',
      limit: '10',
      programCode: '2710',
      studentCode: '202012345',
      name: 'Jane',
      status: 'ACTIVE',
      identification: '123456789',
    });

    expect(errors).toHaveLength(0);
  });

  it('LQ-08: rejects pageSize (project uses limit) and other unknown parameters', () => {
    const pageSizeErrors = validate({ pageSize: '10' });
    expect(pageSizeErrors).toHaveLength(1);
    expect(pageSizeErrors[0].property).toBe('pageSize');

    const unknownErrors = validate({ unknown: 'x' });
    expect(unknownErrors).toHaveLength(1);
    expect(unknownErrors[0].property).toBe('unknown');
  });
});
