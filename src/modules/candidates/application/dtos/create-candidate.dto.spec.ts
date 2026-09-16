import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateCandidateDto } from './create-candidate.dto';

describe('CreateCandidateDto', () => {
  const baseValid = {
    firstName: 'Juan',
    lastName: 'Garcia',
    studentCode: '20201234',
    programCode: '1234',
    identificationNumber: '1000123456',
  };

  function validate(input: Record<string, unknown>) {
    return validateSync(plainToInstance(CreateCandidateDto, input));
  }

  it('DTO-C-01: accepts a valid full companion set', () => {
    const errors = validate({
      ...baseValid,
      companionFirstName: 'Maria',
      companionLastName: 'Lopez',
      companionStudentCode: '20209999',
      companionProgramCode: '9999',
      companionIdentification: '2000000000',
    });

    expect(errors).toHaveLength(0);
  });

  it('DTO-C-02: accepts a candidate without companion fields', () => {
    const errors = validate(baseValid);

    expect(errors).toHaveLength(0);
  });

  it.each([
    ['empty string', ''],
    ['whitespace only', '   '],
    ['single character', 'J'],
    ['non-string value', 123],
  ])('DTO-C-03: rejects companionFirstName = %s', (_label, value) => {
    const errors = validate({ ...baseValid, companionFirstName: value });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('companionFirstName');
  });

  it('DTO-C-04: rejects companionFirstName longer than 100 characters', () => {
    const errors = validate({ ...baseValid, companionFirstName: 'x'.repeat(101) });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('companionFirstName');
  });

  it('DTO-C-05: rejects an invalid companionLastName', () => {
    const errors = validate({ ...baseValid, companionLastName: '' });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('companionLastName');
  });

  it.each([
    ['empty string', ''],
    ['whitespace only', '   '],
  ])('DTO-C-06: rejects companionStudentCode = %s', (_label, value) => {
    const errors = validate({ ...baseValid, companionStudentCode: value });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('companionStudentCode');
  });

  it.each([
    ['three digits', '123'],
    ['five digits', '12345'],
    ['letters', 'abcd'],
  ])('DTO-C-07: rejects companionProgramCode = %s', (_label, value) => {
    const errors = validate({ ...baseValid, companionProgramCode: value });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('companionProgramCode');
  });

  it('DTO-C-08: accepts companionProgramCode with surrounding whitespace', () => {
    const errors = validate({ ...baseValid, companionProgramCode: ' 1234 ' });

    expect(errors).toHaveLength(0);
  });

  it.each([
    ['empty string', ''],
    ['whitespace only', '   '],
  ])('DTO-C-09: rejects companionIdentification = %s', (_label, value) => {
    const errors = validate({ ...baseValid, companionIdentification: value });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('companionIdentification');
  });
});
