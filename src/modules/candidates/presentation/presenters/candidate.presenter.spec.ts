import { CandidateEntity } from '../../domain/entities/candidate.entity';
import { CandidatePresenter } from './candidate.presenter';

describe('CandidatePresenter', () => {
  const entity = CandidateEntity.restore({
    id: 'candidate-1',
    firstName: 'Juan',
    lastName: 'Garcia',
    studentCode: '20201234',
    programCode: '1234',
    identificationNumber: '1000123456',
    status: 'ACTIVE',
    createdAt: new Date('2026-08-19T15:00:00.000Z'),
    companionFirstName: null,
    companionLastName: null,
    companionStudentCode: null,
    companionProgramCode: null,
    companionIdentification: null,
  });

  const entityWithCompanion = CandidateEntity.restore({
    id: 'candidate-3',
    firstName: 'Ana',
    lastName: 'Rojas',
    studentCode: '20209999',
    programCode: '0000',
    identificationNumber: '1000999999',
    status: 'ACTIVE',
    createdAt: new Date('2026-08-19T17:00:00.000Z'),
    companionFirstName: 'Maria',
    companionLastName: 'Lopez',
    companionStudentCode: '20207777',
    companionProgramCode: '9999',
    companionIdentification: '2000000000',
  });

  it('maps all candidate fields to the response DTO', () => {
    const response = CandidatePresenter.toResponse(entity);

    expect(response).toEqual({
      id: 'candidate-1',
      firstName: 'Juan',
      lastName: 'Garcia',
      studentCode: '20201234',
      programCode: '1234',
      identificationNumber: '1000123456',
      status: 'ACTIVE',
      companionFirstName: null,
      companionLastName: null,
      companionStudentCode: null,
      companionProgramCode: null,
      companionIdentification: null,
      createdAt: '2026-08-19T15:00:00.000Z',
    });
  });

  it('serializes createdAt to an ISO string', () => {
    const response = CandidatePresenter.toResponse(entity);

    expect(response.createdAt).toBe(entity.createdAt?.toISOString());
    expect(new Date(response.createdAt).toISOString()).toBe(response.createdAt);
  });

  it('exposes only the response contract fields', () => {
    const response = CandidatePresenter.toResponse(entity);

    expect(Object.keys(response).sort()).toEqual(
      [
        'id',
        'firstName',
        'lastName',
        'studentCode',
        'programCode',
        'identificationNumber',
        'status',
        'companionFirstName',
        'companionLastName',
        'companionStudentCode',
        'companionProgramCode',
        'companionIdentification',
        'createdAt',
      ].sort(),
    );
  });

  it('P-01: maps populated companion fields to the response', () => {
    const response = CandidatePresenter.toResponse(entityWithCompanion);

    expect(response.companionFirstName).toBe('Maria');
    expect(response.companionLastName).toBe('Lopez');
    expect(response.companionStudentCode).toBe('20207777');
    expect(response.companionProgramCode).toBe('9999');
    expect(response.companionIdentification).toBe('2000000000');
  });

  it('P-02: maps null companion fields to null in the response', () => {
    const response = CandidatePresenter.toResponse(entity);

    expect(response.companionFirstName).toBeNull();
    expect(response.companionLastName).toBeNull();
    expect(response.companionStudentCode).toBeNull();
    expect(response.companionProgramCode).toBeNull();
    expect(response.companionIdentification).toBeNull();
  });

  describe('toList', () => {
    const otherEntity = CandidateEntity.restore({
      id: 'candidate-2',
      firstName: 'Maria',
      lastName: 'Rodriguez',
      studentCode: '202012346',
      programCode: '2710',
      identificationNumber: '1000000001',
      status: 'ACTIVE',
      createdAt: new Date('2026-08-19T16:00:00.000Z'),
      companionFirstName: null,
      companionLastName: null,
      companionStudentCode: null,
      companionProgramCode: null,
      companionIdentification: null,
    });

    it('maps an array of entities to an array of response DTOs', () => {
      const list = CandidatePresenter.toList([entity, otherEntity]);

      expect(list).toHaveLength(2);
      expect(list[0]).toEqual({
        id: 'candidate-1',
        firstName: 'Juan',
        lastName: 'Garcia',
        studentCode: '20201234',
        programCode: '1234',
        identificationNumber: '1000123456',
        status: 'ACTIVE',
        companionFirstName: null,
        companionLastName: null,
        companionStudentCode: null,
        companionProgramCode: null,
        companionIdentification: null,
        createdAt: '2026-08-19T15:00:00.000Z',
      });
      expect(list[1]).toEqual({
        id: 'candidate-2',
        firstName: 'Maria',
        lastName: 'Rodriguez',
        studentCode: '202012346',
        programCode: '2710',
        identificationNumber: '1000000001',
        status: 'ACTIVE',
        companionFirstName: null,
        companionLastName: null,
        companionStudentCode: null,
        companionProgramCode: null,
        companionIdentification: null,
        createdAt: '2026-08-19T16:00:00.000Z',
      });
    });

    it('returns an empty array for an empty input', () => {
      expect(CandidatePresenter.toList([])).toEqual([]);
    });

    it('exposes only the response contract fields for every item', () => {
      const list = CandidatePresenter.toList([entity, otherEntity]);

      const contract = [
        'id',
        'firstName',
        'lastName',
        'studentCode',
        'programCode',
        'identificationNumber',
        'status',
        'companionFirstName',
        'companionLastName',
        'companionStudentCode',
        'companionProgramCode',
        'companionIdentification',
        'createdAt',
      ].sort();

      expect(Object.keys(list[0]).sort()).toEqual(contract);
      expect(Object.keys(list[1]).sort()).toEqual(contract);
    });

    it('P-04: maps companion fields for every item in the list', () => {
      const list = CandidatePresenter.toList([entityWithCompanion]);

      expect(list[0].companionFirstName).toBe('Maria');
      expect(list[0].companionIdentification).toBe('2000000000');
    });
  });
});
