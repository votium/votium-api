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
      studentCode: '202012345',
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

  it.each(['1', '12', '123', '1234'])('DTO-170-03: accepts programCode = %s', (programCode) => {
    expect(validate({ programCode })).toHaveLength(0);
  });

  it.each(['12345', 'abcd', ''])('DTO-170-04: rejects programCode = %s', (programCode) => {
    const errors = validate({ programCode });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('programCode');
  });

  it.each(['1', '12', '12345', '123456789'])(
    'DTO-170-01: accepts studentCode = %s (1 to 9 digits)',
    (studentCode) => {
      expect(validate({ studentCode })).toHaveLength(0);
    },
  );

  it.each(['1234567890', 'abcd', ''])('DTO-170-02: rejects studentCode = %s', (studentCode) => {
    const errors = validate({ studentCode });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('studentCode');
  });

  it('DTO-170-05: studentCode validation message reflects the maximum of 9 digits', () => {
    const errors = validate({ studentCode: '1234567890' });

    expect(errors).toHaveLength(1);
    expect(JSON.stringify(errors[0].constraints)).toContain(
      'Student code must contain between 1 and 9 digits.',
    );
  });

  it('DTO-170-06: programCode validation message reflects the maximum of 4 digits', () => {
    const errors = validate({ programCode: '12345' });

    expect(errors).toHaveLength(1);
    expect(JSON.stringify(errors[0].constraints)).toContain(
      'Program code must contain between 1 and 4 digits.',
    );
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
