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
});
