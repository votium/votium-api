import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SearchCandidatesQueryDto } from './search-candidates-query.dto';

describe('SearchCandidatesQueryDto', () => {
  function validate(input: Record<string, unknown>) {
    return validateSync(plainToInstance(SearchCandidatesQueryDto, input), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
  }

  it('DTO-Q-01: accepts an empty query (defaults applied by the DTO)', () => {
    expect(validate({})).toHaveLength(0);
  });

  it('DTO-Q-02: accepts the supported filters', () => {
    const errors = validate({
      page: '2',
      limit: '25',
      firstName: 'Juan',
      lastName: 'Garcia',
      name: 'Juan',
      programCode: '1234',
      studentCode: 'CAND-1234',
      identificationNumber: 'ID-12345678',
      status: 'ACTIVE',
    });

    expect(errors).toHaveLength(0);
  });

  it.each(['ACTIVE', 'INACTIVE'])('DTO-Q-03: accepts status = %s', (status) => {
    expect(validate({ status })).toHaveLength(0);
  });

  it.each(['DELETED', 'foo', 'active'])('DTO-Q-04: rejects status = %s', (status) => {
    const errors = validate({ status });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('status');
  });

  it.each(['123', '12345', 'abcd'])('DTO-Q-05: rejects programCode = %s', (programCode) => {
    const errors = validate({ programCode });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('programCode');
  });

  it.each([
    ['zero page', { page: '0' }],
    ['negative limit', { limit: '-5' }],
    ['non numeric page', { page: 'abc' }],
  ])('DTO-Q-06: rejects %s', (_label, input) => {
    const errors = validate(input);

    expect(errors.length).toBeGreaterThan(0);
  });

  it('DTO-Q-07: rejects the removed studyPlanCode parameter', () => {
    const errors = validate({ studyPlanCode: '1234' });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('studyPlanCode');
  });

  it('DTO-Q-08: rejects the removed includeInactive parameter', () => {
    const errors = validate({ includeInactive: 'true' });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('includeInactive');
  });
});
