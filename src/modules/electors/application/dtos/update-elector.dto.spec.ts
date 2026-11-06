import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateElectorDto } from './update-elector.dto';

describe('UpdateElectorDto', () => {
  const validPayload = {
    firstName: 'Maria',
    lastName: 'Rodriguez',
    identification: '2001234567',
    studentCode: '202099999',
    programCode: '8010',
    email: 'maria.rodriguez@correounivalle.edu.co',
  };

  function validate(input: Record<string, unknown>) {
    return validateSync(plainToInstance(UpdateElectorDto, input), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
  }

  it('EUD-01: accepts a valid full payload', () => {
    expect(validate(validPayload)).toHaveLength(0);
  });

  it('EUD-02: trims whitespace on string fields', () => {
    const instance = plainToInstance(UpdateElectorDto, {
      firstName: '  Maria  ',
      lastName: ' Rodriguez ',
      identification: ' 2001234567 ',
      studentCode: ' 202099999 ',
      programCode: ' 8010 ',
      email: '  maria.rodriguez@correounivalle.edu.co ',
    });

    expect(validateSync(instance)).toHaveLength(0);
    expect(instance.firstName).toBe('Maria');
    expect(instance.lastName).toBe('Rodriguez');
    expect(instance.identification).toBe('2001234567');
    expect(instance.studentCode).toBe('202099999');
    expect(instance.programCode).toBe('8010');
    expect(instance.email).toBe('maria.rodriguez@correounivalle.edu.co');
  });

  it.each([
    ['EUD-03', 'firstName'],
    ['EUD-04', 'lastName'],
    ['EUD-05', 'identification'],
    ['EUD-06', 'studentCode'],
    ['EUD-07', 'programCode'],
    ['EUD-08', 'email'],
  ])('%s: rejects when %s is missing (full replacement)', (_id, missing) => {
    const input = { ...validPayload };
    delete input[missing as keyof typeof validPayload];

    const errors = validate(input);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe(missing);
  });

  it.each(['', '   '])('EUD-09: rejects empty/whitespace-only identification = %j', (value) => {
    const errors = validate({ ...validPayload, identification: value });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('identification');
  });

  it.each(['', '   '])('EUD-09: rejects empty/whitespace-only studentCode = %j', (value) => {
    const errors = validate({ ...validPayload, studentCode: value });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('studentCode');
  });

  it('EUD-10: rejects short firstName (<2 characters)', () => {
    const errors = validate({ ...validPayload, firstName: 'J' });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('firstName');
  });

  it('EUD-10: rejects long firstName (>100 characters)', () => {
    const errors = validate({ ...validPayload, firstName: 'J'.repeat(101) });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('firstName');
  });

  it.each(['271', '27100', 'abcd', '12 4'])(
    'EUD-11: rejects programCode %j with the exact message',
    (value) => {
      const errors = validate({ ...validPayload, programCode: value });

      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('programCode');
      expect(errors[0].constraints?.matches).toBe('Program code must contain exactly four digits.');
    },
  );

  it.each(['x', 'x@', 'x@y'])('EUD-12: rejects invalid email %j', (value) => {
    const errors = validate({ ...validPayload, email: value });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('email');
  });

  it.each(['id', 'status', 'isActive', 'createdAt', 'updatedAt', 'passwordHash'])(
    'EUD-13: rejects system-managed field %s',
    (field) => {
      const errors = validate({ ...validPayload, [field]: 'x' });

      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe(field);
    },
  );

  it('EUD-14: rejects an empty body (full replacement enforced)', () => {
    const errors = validate({});

    expect(errors.length).toBeGreaterThan(0);
  });
});
