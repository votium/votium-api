import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SearchElectorsQueryDto } from './search-electors-query.dto';

describe('SearchElectorsQueryDto', () => {
  function validate(input: Record<string, unknown>) {
    return validateSync(plainToInstance(SearchElectorsQueryDto, input), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
  }

  it('DTO-Q-01: accepts an empty query (defaults applied by the DTO)', () => {
    expect(validate({})).toHaveLength(0);
  });

  it('DTO-Q-02: accepts all canonical filters', () => {
    const errors = validate({
      page: '2',
      limit: '25',
      name: 'Jane',
      studentCode: '202012345',
      programCode: '2710',
    });

    expect(errors).toHaveLength(0);
  });

  it('DTO-Q-03: rejects the legacy student_code parameter', () => {
    const errors = validate({ student_code: '202012345' });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('student_code');
  });

  it('DTO-Q-04: rejects the legacy program_code parameter', () => {
    const errors = validate({ program_code: '2710' });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('program_code');
  });

  it('DTO-Q-05: rejects an unknown parameter', () => {
    const errors = validate({ unknown: 'value' });

    expect(errors).toHaveLength(1);
  });

  it.each(['0', '-5', 'abc'])('DTO-Q-06: rejects invalid page = %s', (page) => {
    const errors = validate({ page });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('page');
  });

  it.each(['0', '-5', 'abc'])('DTO-Q-07: rejects invalid limit = %s', (limit) => {
    const errors = validate({ limit });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('limit');
  });

  it('DTO-Q-08: accepts string filter values with surrounding whitespace', () => {
    const errors = validate({
      name: '  Jane  ',
      studentCode: ' 202012345 ',
      programCode: ' 2710 ',
    });

    expect(errors).toHaveLength(0);
  });
});
