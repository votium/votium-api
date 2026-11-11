import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ListVoterElectionsQueryDto } from './list-voter-elections-query.dto';

describe('ListVoterElectionsQueryDto', () => {
  function validate(input: Record<string, unknown>) {
    return validateSync(plainToInstance(ListVoterElectionsQueryDto, input), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
  }

  it('VQ-01: accepts an empty query and applies pagination defaults', () => {
    const dto = plainToInstance(ListVoterElectionsQueryDto, {});

    expect(validate({})).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(10);
  });

  it('VQ-02: accepts valid page/limit integers', () => {
    expect(validate({ page: '2', limit: '25' })).toHaveLength(0);
  });

  it.each(['0', '-5', 'abc', '1.5'])('VQ-03: rejects invalid page = %s', (page) => {
    const errors = validate({ page });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('page');
  });

  it.each(['0', '-5', 'abc', '1.5'])('VQ-04: rejects invalid limit = %s', (limit) => {
    const errors = validate({ limit });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('limit');
  });

  it('VQ-05: normalizes a lowercase status to uppercase', () => {
    const dto = plainToInstance(ListVoterElectionsQueryDto, { status: 'active' });

    expect(validate({ status: 'active' })).toHaveLength(0);
    expect(dto.status).toBe('ACTIVE');
  });

  it.each(['DELETED', 'foo', ''])('VQ-06: rejects status = %j', (status) => {
    const errors = validate({ status });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('status');
  });

  it.each(['2026-8-29', '29-08-2026', '2026/08/29', 'not-a-date'])(
    'VQ-07: rejects startDateFrom = %s',
    (startDateFrom) => {
      const errors = validate({ startDateFrom });

      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('startDateFrom');
    },
  );

  it.each(['2026-8-29', '29-08-2026', '2026/08/29', 'not-a-date'])(
    'VQ-08: rejects startDateTo = %s',
    (startDateTo) => {
      const errors = validate({ startDateTo });

      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('startDateTo');
    },
  );

  it('VQ-09: accepts all canonical filters', () => {
    expect(
      validate({
        page: '1',
        limit: '10',
        electionCode: 'ELECTION-102026',
        status: 'ACTIVE',
        startDateFrom: '2026-08-29',
        startDateTo: '2026-12-31',
      }),
    ).toHaveLength(0);
  });

  it('VQ-10: rejects client-provided identity and unknown parameters', () => {
    for (const input of [{ electorId: 'x' }, { unknown: 'x' }]) {
      const errors = validate(input);
      expect(errors).toHaveLength(1);
    }
  });
});
