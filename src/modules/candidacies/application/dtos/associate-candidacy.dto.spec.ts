import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AssociateCandidacyDto } from './associate-candidacy.dto';

describe('AssociateCandidacyDto', () => {
  function validate(input: Record<string, unknown>) {
    return validateSync(plainToInstance(AssociateCandidacyDto, input));
  }

  it('AD-01: accepts a valid UUID candidateId', () => {
    const errors = validate({ candidateId: '00000000-0000-4000-8000-000000000000' });

    expect(errors).toHaveLength(0);
  });

  it('AD-02: rejects a missing candidateId', () => {
    const errors = validate({});

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('candidateId');
  });

  it('AD-03: rejects a non-UUID candidateId', () => {
    const errors = validate({ candidateId: 'not-a-uuid' });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('candidateId');
  });
});
