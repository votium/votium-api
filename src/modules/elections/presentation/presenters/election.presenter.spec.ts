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
});
