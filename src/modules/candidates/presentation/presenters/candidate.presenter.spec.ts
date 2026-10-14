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
    email: null,
    phone: null,
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
    email: null,
    phone: null,
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
      email: null,
      phone: null,
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
        'email',
        'phone',
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
      email: null,
      phone: null,
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
        email: null,
        phone: null,
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
        email: null,
        phone: null,
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
        'email',
        'phone',
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

  describe('toDetail', () => {
    const buildElection = (
      overrides: Partial<{
        id: string;
        electionId: string;
        candidateId: string;
        electionName: string;
        electionStatus: string;
        electionStartDate: Date;
        electionStartTime: Date;
        electionEndDate: Date;
        electionEndTime: Date;
        createdAt: Date;
      }> = {},
    ) => ({
      id: 'candidacy-1',
      electionId: 'election-1',
      candidateId: 'candidate-1',
      electionName: 'Election 1',
      electionStatus: 'PUBLISHED',
      electionStartDate: new Date('2026-09-01'),
      electionStartTime: new Date('2026-09-01T08:00:00.000Z'),
      electionEndDate: new Date('2026-09-02'),
      electionEndTime: new Date('2026-09-02T20:00:00.000Z'),
      createdAt: new Date('2026-08-15T10:00:00.000Z'),
      ...overrides,
    });

    it('PR-D-01: maps elections[].id from the election identifier', () => {
      const election = buildElection({ id: 'candidacy-999', electionId: 'election-123' });
      const response = CandidatePresenter.toDetail(entity, [election]);

      expect(response.elections[0].id).toBe('election-123');
    });

    it('PR-D-02: does not use the candidacy id as the election id', () => {
      const election = buildElection({ id: 'candidacy-999', electionId: 'election-123' });
      const response = CandidatePresenter.toDetail(entity, [election]);

      expect(response.elections[0].id).not.toBe('candidacy-999');
    });

    it('PR-D-03: maps the remaining election fields', () => {
      const election = buildElection();
      const response = CandidatePresenter.toDetail(entity, [election]);

      expect(response.elections[0]).toMatchObject({
        id: 'election-1',
        name: 'Election 1',
        status: 'PUBLISHED',
        startDate: '2026-09-01',
        startTime: '08:00:00.000Z',
        endDate: '2026-09-02',
        endTime: '20:00:00.000Z',
      });
    });

    it('PR-D-04: marks a schedule-active election as isScheduleActive and isCurrentlyActive', () => {
      const election = buildElection();
      const now = new Date('2026-09-01T12:00:00.000Z');
      const response = CandidatePresenter.toDetail(entity, [election], now);

      expect(response.elections[0].isScheduleActive).toBe(true);
      expect(response.isCurrentlyActive).toBe(true);
    });

    it('PR-D-05: marks an election outside the schedule as inactive', () => {
      const election = buildElection();
      const now = new Date('2026-08-31T12:00:00.000Z');
      const response = CandidatePresenter.toDetail(entity, [election], now);

      expect(response.elections[0].isScheduleActive).toBe(false);
      expect(response.isCurrentlyActive).toBe(false);
    });

    it('PR-D-06: maps an empty elections array to an empty list and inactive flag', () => {
      const response = CandidatePresenter.toDetail(entity, []);

      expect(response.elections).toEqual([]);
      expect(response.isCurrentlyActive).toBe(false);
    });

    it('PR-D-07: maps each election to its own identifier without cross-contamination', () => {
      const first = buildElection({ id: 'candidacy-a', electionId: 'election-a' });
      const second = buildElection({ id: 'candidacy-b', electionId: 'election-b' });
      const response = CandidatePresenter.toDetail(entity, [first, second]);

      expect(response.elections.map((e) => e.id)).toEqual(['election-a', 'election-b']);
    });

    it('PR-D-08: preserves all candidate top-level fields', () => {
      const response = CandidatePresenter.toDetail(entity, [buildElection()]);

      expect(response).toMatchObject({
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
        email: null,
        phone: null,
        createdAt: '2026-08-19T15:00:00.000Z',
      });
    });

    it('PR-D-09: exposes only the detail response contract fields', () => {
      const response = CandidatePresenter.toDetail(entity, [buildElection()]);

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
          'email',
          'phone',
          'createdAt',
          'elections',
          'isCurrentlyActive',
        ].sort(),
      );
      expect(Object.keys(response.elections[0]).sort()).toEqual(
        [
          'id',
          'name',
          'status',
          'startDate',
          'startTime',
          'endDate',
          'endTime',
          'isScheduleActive',
        ].sort(),
      );
    });
  });
});
