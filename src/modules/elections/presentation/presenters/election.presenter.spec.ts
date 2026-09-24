import { ElectionDetailResult } from '../../application/use-cases/get-election-detail.use-case';
import { ElectionEntity } from '../../domain/entities/election.entity';
import { ElectionPresenter } from './election.presenter';

describe('ElectionPresenter', () => {
  const entity = ElectionEntity.restore({
    id: 'election-1',
    name: 'Student Council Election 2026',
    description: 'Election for the 2026 student council.',
    startDate: new Date(Date.UTC(2026, 9, 1)),
    startTime: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
    endDate: new Date(Date.UTC(2026, 9, 1)),
    endTime: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
    currentStatus: 'CREATED',
    blankVoteEnabled: false,
    createdAt: new Date('2026-08-19T15:00:00.000Z'),
  });

  it('formats start/end dates as YYYY-MM-DD', () => {
    const dto = ElectionPresenter.toResponse(entity);
    expect(dto.startDate).toBe('2026-10-01');
    expect(dto.endDate).toBe('2026-10-01');
  });

  it('formats start/end times as HH:mm:ss', () => {
    const dto = ElectionPresenter.toResponse(entity);
    expect(dto.startTime).toBe('08:00:00');
    expect(dto.endTime).toBe('18:00:00');
  });

  it('includes CREATED status and blankVoteEnabled', () => {
    const dto = ElectionPresenter.toResponse(entity);
    expect(dto.currentStatus).toBe('CREATED');
    expect(dto.blankVoteEnabled).toBe(false);
  });

  it('formats createdAt as an ISO string', () => {
    const dto = ElectionPresenter.toResponse(entity);
    expect(dto.createdAt).toBe('2026-08-19T15:00:00.000Z');
  });

  it('exposes only the ElectionResponseDto contract', () => {
    const dto = ElectionPresenter.toResponse(entity);
    expect(Object.keys(dto).sort()).toEqual(
      [
        'id',
        'name',
        'description',
        'startDate',
        'startTime',
        'endDate',
        'endTime',
        'currentStatus',
        'blankVoteEnabled',
        'createdAt',
      ].sort(),
    );
  });

  describe('toDetail', () => {
    const result: ElectionDetailResult = {
      election: entity,
      statusHistory: [
        { status: 'PENDING', timestamp: new Date('2026-08-20T10:00:00.000Z') },
        { status: 'ACTIVE', timestamp: new Date('2026-08-21T10:00:00.000Z') },
      ],
      candidacies: [
        {
          id: 'candidacy-1',
          electionId: 'election-1',
          candidateId: 'candidate-1',
          candidateFirstName: 'Juan',
          candidateLastName: 'Garcia',
          positionNumber: 1,
          imageUrl: null,
          createdAt: new Date('2026-08-19T15:00:00.000Z'),
        },
      ],
      registeredVoters: 42,
    };

    it('P-01: keeps the base fields identical to toResponse (same date/time serialization)', () => {
      const detail = ElectionPresenter.toDetail(result);
      const base = ElectionPresenter.toResponse(entity);

      expect(detail.id).toBe(base.id);
      expect(detail.name).toBe(base.name);
      expect(detail.description).toBe(base.description);
      expect(detail.startDate).toBe('2026-10-01');
      expect(detail.startTime).toBe('08:00:00');
      expect(detail.endDate).toBe('2026-10-01');
      expect(detail.endTime).toBe('18:00:00');
      expect(detail.currentStatus).toBe('CREATED');
      expect(detail.blankVoteEnabled).toBe(false);
      expect(detail.createdAt).toBe('2026-08-19T15:00:00.000Z');
    });

    it('P-02: maps each history entry to { status, timestamp } with the ISO timestamp, preserving order', () => {
      const detail = ElectionPresenter.toDetail(result);

      expect(detail.statusHistory).toEqual([
        { status: 'PENDING', timestamp: '2026-08-20T10:00:00.000Z' },
        { status: 'ACTIVE', timestamp: '2026-08-21T10:00:00.000Z' },
      ]);
    });

    it('P-03: maps candidacies to the candidacy-with-candidate shape and copies registeredVoters', () => {
      const detail = ElectionPresenter.toDetail(result);

      expect(detail.candidacies).toEqual([
        {
          id: 'candidacy-1',
          positionNumber: 1,
          imageUrl: null,
          createdAt: '2026-08-19T15:00:00.000Z',
          candidate: { id: 'candidate-1', firstName: 'Juan', lastName: 'Garcia' },
        },
      ]);
      expect(detail.registeredVoters).toBe(42);
    });

    it('P-04: exposes exactly the ElectionDetailResponseDto contract', () => {
      const detail = ElectionPresenter.toDetail(result);
      expect(Object.keys(detail).sort()).toEqual(
        [
          'id',
          'name',
          'description',
          'startDate',
          'startTime',
          'endDate',
          'endTime',
          'currentStatus',
          'blankVoteEnabled',
          'createdAt',
          'statusHistory',
          'candidacies',
          'registeredVoters',
        ].sort(),
      );
    });
  });
});
