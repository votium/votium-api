import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateCandidateDto } from './update-candidate.dto';

describe('UpdateCandidateDto', () => {
  function validate(input: Record<string, unknown>) {
    return validateSync(plainToInstance(UpdateCandidateDto, input));
  }

  it('accepts a single valid companion field (partial PATCH)', () => {
    const errors = validate({ companionFirstName: 'Maria' });

    expect(errors).toHaveLength(0);
  });

  it('accepts candidate fields without companion fields', () => {
    const errors = validate({ firstName: 'Juan' });

    expect(errors).toHaveLength(0);
  });

  it('accepts an empty body', () => {
    const errors = validate({});

    expect(errors).toHaveLength(0);
  });

  it('rejects an invalid companionProgramCode', () => {
    const errors = validate({ companionProgramCode: '12' });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('companionProgramCode');
  });

  it('rejects an invalid companionFirstName', () => {
    const errors = validate({ companionFirstName: 'J' });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('companionFirstName');
  });

  it('accepts each companion field independently', () => {
    const validBodies = [
      { companionFirstName: 'Maria' },
      { companionLastName: 'Lopez' },
      { companionStudentCode: '20209999' },
      { companionProgramCode: '9999' },
      { companionIdentification: '2000000000' },
    ];

    for (const body of validBodies) {
      expect(validate(body)).toHaveLength(0);
    }
  });
});
