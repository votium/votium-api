import { CandidateEntity } from '../../src/modules/candidates/domain/entities/candidate.entity';
import { PrismaCandidateMapper } from '../../src/modules/candidates/infrastructure/mappers/prisma-candidate.mapper';

describe('PrismaCandidateMapper.toUpdateData', () => {
  it('M-01: maps all provided fields to snake_case', () => {
    const data = PrismaCandidateMapper.toUpdateData({
      firstName: 'Maria',
      lastName: 'Lopez',
      programCode: '2710',
      identificationNumber: '2000000000',
    });

    expect(data).toEqual({
      first_name: 'Maria',
      last_name: 'Lopez',
      program_code: '2710',
      identification_number: '2000000000',
    });
  });

  it('M-02: maps only firstName when partial', () => {
    const data = PrismaCandidateMapper.toUpdateData({ firstName: 'New' });

    expect(data).toEqual({ first_name: 'New' });
  });

  it('M-03: maps only identificationNumber when partial', () => {
    const data = PrismaCandidateMapper.toUpdateData({ identificationNumber: 'NEW123' });

    expect(data).toEqual({ identification_number: 'NEW123' });
  });

  it('M-04: returns an empty object when input is empty', () => {
    const data = PrismaCandidateMapper.toUpdateData({});

    expect(data).toEqual({});
  });

  it('M-05: excludes undefined values from the payload', () => {
    const data = PrismaCandidateMapper.toUpdateData({
      firstName: undefined,
      lastName: 'Test',
    });

    expect(data).toEqual({ last_name: 'Test' });
  });

  it('M-06: maps all five companion fields to snake_case', () => {
    const data = PrismaCandidateMapper.toUpdateData({
      companionFirstName: 'Maria',
      companionLastName: 'Lopez',
      companionStudentCode: '20209999',
      companionProgramCode: '9999',
      companionIdentification: '2000000000',
    });

    expect(data).toEqual({
      companion_first_name: 'Maria',
      companion_last_name: 'Lopez',
      companion_student_code: '20209999',
      companion_program_code: '9999',
      companion_identification: '2000000000',
    });
  });

  it('M-07: maps a single companion field to its column only', () => {
    const data = PrismaCandidateMapper.toUpdateData({ companionFirstName: 'Maria' });

    expect(data).toEqual({ companion_first_name: 'Maria' });
  });

  it('M-08: excludes undefined companion fields from the payload', () => {
    const data = PrismaCandidateMapper.toUpdateData({
      companionFirstName: undefined,
      companionStudentCode: '20209999',
      firstName: 'Juan',
    });

    expect(data).toEqual({ companion_student_code: '20209999', first_name: 'Juan' });
  });

  it('M-11: excludes null companion values from the payload', () => {
    const data = PrismaCandidateMapper.toUpdateData({
      companionFirstName: null,
      companionStudentCode: '20209999',
    });

    expect(data).toEqual({ companion_student_code: '20209999' });
  });

  it('M-12: excludes null base values from the payload', () => {
    const data = PrismaCandidateMapper.toUpdateData({
      firstName: null,
      lastName: 'Test',
    });

    expect(data).toEqual({ last_name: 'Test' });
  });

  it('M-13: returns an empty object when the input contains only null values', () => {
    const data = PrismaCandidateMapper.toUpdateData({
      firstName: null,
      companionFirstName: null,
    });

    expect(data).toEqual({});
  });

  it('MC-3: toUpdateData never includes deleted_at', () => {
    const data = PrismaCandidateMapper.toUpdateData({ firstName: 'Maria' });

    expect(data).not.toHaveProperty('deleted_at');
    expect(data).toEqual({ first_name: 'Maria' });
  });
});

describe('PrismaCandidateMapper.toPersistence', () => {
  const base = {
    firstName: 'Juan',
    lastName: 'Garcia',
    studentCode: '20201234',
    programCode: '1234',
    identificationNumber: '1000123456',
  };

  it('M-09: includes explicit null companion columns when the entity has none', () => {
    const entity = CandidateEntity.create(base);

    const data = PrismaCandidateMapper.toPersistence(entity);

    expect(data).toEqual({
      first_name: 'Juan',
      last_name: 'Garcia',
      student_code: '20201234',
      program_code: '1234',
      identification_number: '1000123456',
      status: 'ACTIVE',
      companion_first_name: null,
      companion_last_name: null,
      companion_student_code: null,
      companion_program_code: null,
      companion_identification: null,
    });
    expect(data).not.toHaveProperty('id');
    expect(data).not.toHaveProperty('created_at');
    expect(data).not.toHaveProperty('deleted_at');
  });

  it('MC-2: toPersistence never includes deleted_at', () => {
    const entity = CandidateEntity.create(base);

    const data = PrismaCandidateMapper.toPersistence(entity);

    expect(data).not.toHaveProperty('deleted_at');
  });

  it('M-10: includes companion values when the entity has them', () => {
    const entity = CandidateEntity.create({
      ...base,
      companionFirstName: 'Maria',
      companionLastName: 'Lopez',
      companionStudentCode: '20209999',
      companionProgramCode: '9999',
      companionIdentification: '2000000000',
    });

    const data = PrismaCandidateMapper.toPersistence(entity);

    expect(data).toMatchObject({
      companion_first_name: 'Maria',
      companion_last_name: 'Lopez',
      companion_student_code: '20209999',
      companion_program_code: '9999',
      companion_identification: '2000000000',
      status: 'ACTIVE',
    });
  });
});

describe('PrismaCandidateMapper.toDomain', () => {
  it('round-trips null and populated companion values without transformation', () => {
    const entity = PrismaCandidateMapper.toDomain({
      id: 'candidate-1',
      first_name: 'Juan',
      last_name: 'Garcia',
      student_code: '20201234',
      program_code: '1234',
      identification_number: '1000123456',
      status: 'ACTIVE',
      companion_first_name: null,
      companion_last_name: null,
      companion_student_code: '20209999',
      companion_program_code: null,
      companion_identification: '2000000000',
      created_at: new Date('2026-08-19T15:00:00.000Z'),
      deleted_at: null,
    });

    expect(entity.id).toBe('candidate-1');
    expect(entity.companionFirstName).toBeNull();
    expect(entity.companionLastName).toBeNull();
    expect(entity.companionStudentCode).toBe('20209999');
    expect(entity.companionProgramCode).toBeNull();
    expect(entity.companionIdentification).toBe('2000000000');
    expect(entity.deletedAt).toBeNull();
    expect(entity.isDeleted()).toBe(false);
  });

  it('MC-1: toDomain maps deleted_at (null and a date)', () => {
    const row = {
      id: 'candidate-1',
      first_name: 'Juan',
      last_name: 'Garcia',
      student_code: '20201234',
      program_code: '1234',
      identification_number: '1000123456',
      status: 'ACTIVE',
      companion_first_name: null,
      companion_last_name: null,
      companion_student_code: null,
      companion_program_code: null,
      companion_identification: null,
      created_at: new Date('2026-08-19T15:00:00.000Z'),
      deleted_at: new Date('2026-09-01T10:00:00.000Z'),
    };

    const entity = PrismaCandidateMapper.toDomain(row);

    expect(entity.deletedAt).toEqual(new Date('2026-09-01T10:00:00.000Z'));
    expect(entity.isDeleted()).toBe(true);
  });
});
