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
        'createdAt',
      ].sort(),
    );
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
        createdAt: '2026-08-19T16:00:00.000Z',
      });
    });

    it('returns an empty array for an empty input', () => {
      expect(CandidatePresenter.toList([])).toEqual([]);
    });

    it('exposes only the response contract fields for every item', () => {
      const list = CandidatePresenter.toList([entity, otherEntity]);

      expect(Object.keys(list[0]).sort()).toEqual(
        [
          'id',
          'firstName',
          'lastName',
          'studentCode',
          'programCode',
          'identificationNumber',
          'status',
          'createdAt',
        ].sort(),
      );
      expect(Object.keys(list[1]).sort()).toEqual(
        [
          'id',
          'firstName',
          'lastName',
          'studentCode',
          'programCode',
          'identificationNumber',
          'status',
          'createdAt',
        ].sort(),
      );
    });
  });
});
