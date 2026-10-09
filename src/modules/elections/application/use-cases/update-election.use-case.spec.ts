import { ElectionEntity } from '../../domain/entities/election.entity';
import { ElectionNotFoundError } from '../../domain/errors/election-not-found.error';
import { ElectionNotEditableError } from '../../domain/errors/election-not-editable.error';
import { ElectionNameConflictError } from '../../domain/errors/election-name-conflict.error';
import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import type { UpdateElectionDto } from '../dtos/update-election.dto';
import { UpdateElectionUseCase } from './update-election.use-case';

function buildEditableElection(
  over: Partial<Parameters<typeof ElectionEntity.restore>[0]> = {},
): ElectionEntity {
  return ElectionEntity.restore({
    id: 'election-1',
    name: 'Student Council Election 2026',
    description: 'Election for the 2026 student council.',
    startDate: new Date(Date.UTC(2026, 9, 1)),
    startTime: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
    endDate: new Date(Date.UTC(2026, 9, 1)),
    endTime: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
    currentStatus: 'PENDING',
    blankVoteEnabled: false,
    createdAt: new Date('2026-08-19T15:00:00.000Z'),
    ...over,
  });
}

describe('UpdateElectionUseCase', () => {
  const elections: jest.Mocked<ElectionRepository> = {
    findAll: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    findStatusHistory: jest.fn(),
    update: jest.fn(),
    hasCandidates: jest.fn(),
    hasVotes: jest.fn(),
    hasElectoralRoll: jest.fn(),
    findExpiredActive: jest.fn(),
    updateStatus: jest.fn(),
    delete: jest.fn(),
  };
  const audit: jest.Mocked<Pick<AuditLogPort, 'log'>> = {
    log: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    elections.findById.mockResolvedValue(buildEditableElection());
    elections.update.mockImplementation((e) => Promise.resolve(e));
  });

  const validDto = (over: Partial<UpdateElectionDto> = {}): UpdateElectionDto => ({
    name: 'Renamed Election',
    description: 'Updated description.',
    startDate: '2026-10-01',
    startTime: '08:00:00',
    endDate: '2026-10-01',
    endTime: '18:00:00',
    ...over,
  });

  it('UC-1: updates an editable election and returns the updated entity with PENDING status', async () => {
    const result = await new UpdateElectionUseCase(elections, audit).execute(
      'election-1',
      validDto(),
      'admin-1',
    );

    expect(elections.update.mock.calls).toHaveLength(1);
    const passed = elections.update.mock.calls[0][0];
    expect(passed.currentStatus).toBe('PENDING');
    expect(result).toBe(passed);
  });

  it('UC-2: a complete payload applies all six configurable fields', async () => {
    await new UpdateElectionUseCase(elections, audit).execute('election-1', validDto(), 'admin-1');

    const passed = elections.update.mock.calls[0][0];
    expect(passed.name).toBe('Renamed Election');
    expect(passed.description).toBe('Updated description.');
    expect(passed.startDate.getUTCDate()).toBe(1);
    expect(passed.startTime.getUTCHours()).toBe(8);
    expect(passed.endDate.getUTCDate()).toBe(1);
    expect(passed.endTime.getUTCHours()).toBe(18);
  });

  it('UC-3: trims name and description before persistence', async () => {
    await new UpdateElectionUseCase(elections, audit).execute(
      'election-1',
      validDto({ name: '  Renamed  ', description: '  Desc  ' }),
      'admin-1',
    );

    const passed = elections.update.mock.calls[0][0];
    expect(passed.name).toBe('Renamed');
    expect(passed.description).toBe('Desc');
  });

  it('UC-4: persists an explicit blankVoteEnabled value', async () => {
    await new UpdateElectionUseCase(elections, audit).execute(
      'election-1',
      validDto({ blankVoteEnabled: true }),
      'admin-1',
    );
    expect(elections.update.mock.calls[0][0].blankVoteEnabled).toBe(true);
  });

  it('UC-5: omitting blankVoteEnabled keeps the existing value', async () => {
    await new UpdateElectionUseCase(elections, audit).execute('election-1', validDto(), 'admin-1');
    expect(elections.update.mock.calls[0][0].blankVoteEnabled).toBe(false);
  });

  it('UC-6: renaming to the election own current name succeeds (self excluded)', async () => {
    elections.findById.mockResolvedValue(buildEditableElection({ name: 'Same Name' }));
    const result = await new UpdateElectionUseCase(elections, audit).execute(
      'election-1',
      validDto({ name: 'Same Name' }),
      'admin-1',
    );

    expect(elections.update.mock.calls).toHaveLength(1);
    expect(result.name).toBe('Same Name');
  });

  it('UC-7: throws ElectionNotFoundError when the election does not exist', async () => {
    elections.findById.mockResolvedValue(null);

    await expect(
      new UpdateElectionUseCase(elections, audit).execute('missing', validDto(), 'admin-1'),
    ).rejects.toBeInstanceOf(ElectionNotFoundError);
  });

  it('UC-8: throws ElectionNotEditableError for non-PENDING status and never calls update', async () => {
    for (const status of ['CREATED', 'PUBLISHED', 'CLOSED', 'ACTIVE'] as const) {
      elections.findById.mockResolvedValue(buildEditableElection({ currentStatus: status }));
      await expect(
        new UpdateElectionUseCase(elections, audit).execute('election-1', validDto(), 'admin-1'),
      ).rejects.toBeInstanceOf(ElectionNotEditableError);
    }
    expect(elections.update.mock.calls).toHaveLength(0);
  });

  it('UC-9: rejects an invalid calendar date with ELECTION_INVALID_DATE', async () => {
    await expect(
      new UpdateElectionUseCase(elections, audit).execute(
        'election-1',
        validDto({ startDate: '2026-02-30' }),
        'admin-1',
      ),
    ).rejects.toMatchObject({ code: 'ELECTION_INVALID_DATE' });
  });

  it('UC-10: rejects an invalid time with ELECTION_INVALID_TIME', async () => {
    await expect(
      new UpdateElectionUseCase(elections, audit).execute(
        'election-1',
        validDto({ startTime: '25:00:00' }),
        'admin-1',
      ),
    ).rejects.toMatchObject({ code: 'ELECTION_INVALID_TIME' });
  });

  it('UC-11: rejects a supplied interval where start >= end', async () => {
    // equal start/end instants
    await expect(
      new UpdateElectionUseCase(elections, audit).execute(
        'election-1',
        validDto({ endTime: '08:00:00' }),
        'admin-1',
      ),
    ).rejects.toMatchObject({ code: 'ELECTION_INVALID_DATE_RANGE' });

    // end before start
    await expect(
      new UpdateElectionUseCase(elections, audit).execute(
        'election-1',
        validDto({ startDate: '2026-10-02', endDate: '2026-10-01' }),
        'admin-1',
      ),
    ).rejects.toMatchObject({ code: 'ELECTION_INVALID_DATE_RANGE' });
  });

  it('UC-12: immutable fields (id, currentStatus, createdAt) are never changed', async () => {
    const original = buildEditableElection();
    await new UpdateElectionUseCase(elections, audit).execute('election-1', validDto(), 'admin-1');

    const passed = elections.update.mock.calls[0][0];
    expect(passed.id).toBe(original.id);
    expect(passed.currentStatus).toBe(original.currentStatus);
    expect(passed.createdAt).toEqual(original.createdAt);
  });

  it('UC-13: propagates a name conflict as ElectionNameConflictError', async () => {
    elections.update.mockRejectedValue(new ElectionNameConflictError());

    await expect(
      new UpdateElectionUseCase(elections, audit).execute(
        'election-1',
        validDto({ name: 'Taken' }),
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(ElectionNameConflictError);
    expect(elections.update.mock.calls).toHaveLength(1);
  });

  it('UC-14: records an audit entry on success', async () => {
    await new UpdateElectionUseCase(elections, audit).execute('election-1', validDto(), 'admin-1');

    expect(audit.log.mock.calls).toHaveLength(1);
    expect(audit.log.mock.calls[0]).toEqual([
      'ELECTION_UPDATED',
      'admin-1',
      { electionId: 'election-1' },
    ]);
  });

  it('UC-15: skips the audit log when requestingUserId is absent', async () => {
    await new UpdateElectionUseCase(elections, audit).execute('election-1', validDto(), '');

    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('UC-16: propagates unexpected repository failures unchanged', async () => {
    elections.update.mockRejectedValue(new Error('database exploded'));

    await expect(
      new UpdateElectionUseCase(elections, audit).execute('election-1', validDto(), 'admin-1'),
    ).rejects.toThrow('database exploded');
  });
});
