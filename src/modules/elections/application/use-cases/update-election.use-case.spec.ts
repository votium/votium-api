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
    currentStatus: 'CREATED',
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
    update: jest.fn(),
    hasCandidates: jest.fn(),
    hasVotes: jest.fn(),
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
    ...over,
  });

  it('UC-1: edits an editable election and returns the updated entity with CREATED status', async () => {
    const result = await new UpdateElectionUseCase(elections, audit).execute(
      'election-1',
      validDto(),
      'admin-1',
    );

    expect(elections.update.mock.calls).toHaveLength(1);
    const passed = elections.update.mock.calls[0][0];
    expect(passed.currentStatus).toBe('CREATED');
    expect(result).toBe(passed);
  });

  it('UC-2: omitted fields are preserved (only provided field changes)', async () => {
    await new UpdateElectionUseCase(elections, audit).execute(
      'election-1',
      { name: 'Renamed' },
      'admin-1',
    );

    const passed = elections.update.mock.calls[0][0];
    expect(passed.name).toBe('Renamed');
    expect(passed.description).toBe('Election for the 2026 student council.');
    expect(passed.startDate.getUTCDate()).toBe(1);
    expect(passed.endTime.getUTCHours()).toBe(18);
    expect(passed.blankVoteEnabled).toBe(false);
  });

  it('UC-3: trims name and description before persistence', async () => {
    await new UpdateElectionUseCase(elections, audit).execute(
      'election-1',
      { name: '  Renamed  ', description: '  Desc  ' },
      'admin-1',
    );

    const passed = elections.update.mock.calls[0][0];
    expect(passed.name).toBe('Renamed');
    expect(passed.description).toBe('Desc');
  });

  it('UC-4: persists an explicit blankVoteEnabled value', async () => {
    await new UpdateElectionUseCase(elections, audit).execute(
      'election-1',
      { blankVoteEnabled: true },
      'admin-1',
    );
    expect(elections.update.mock.calls[0][0].blankVoteEnabled).toBe(true);
  });

  it('UC-5: partial date/time update keeps the other date/time components', async () => {
    await new UpdateElectionUseCase(elections, audit).execute(
      'election-1',
      { startTime: '09:00:00' },
      'admin-1',
    );

    const passed = elections.update.mock.calls[0][0];
    expect(passed.startTime.getUTCHours()).toBe(9);
    expect(passed.startDate.getUTCDate()).toBe(1);
    expect(passed.endTime.getUTCHours()).toBe(18);
  });

  it('UC-6: renaming to the election own current name succeeds (self excluded)', async () => {
    elections.findById.mockResolvedValue(buildEditableElection({ name: 'Same Name' }));
    const result = await new UpdateElectionUseCase(elections, audit).execute(
      'election-1',
      { name: 'Same Name' },
      'admin-1',
    );

    expect(elections.update.mock.calls).toHaveLength(1);
    expect(result.name).toBe('Same Name');
  });

  it('UC-7: throws ElectionNotFoundError when the election does not exist', async () => {
    elections.findById.mockResolvedValue(null);

    await expect(
      new UpdateElectionUseCase(elections, audit).execute('missing', { name: 'X' }, 'admin-1'),
    ).rejects.toBeInstanceOf(ElectionNotFoundError);
  });

  it('UC-8: throws ElectionNotEditableError for non-CREATED status and never calls update', async () => {
    for (const status of ['PENDING', 'PUBLISHED', 'CLOSED', 'ACTIVE'] as const) {
      elections.findById.mockResolvedValue(buildEditableElection({ currentStatus: status }));
      await expect(
        new UpdateElectionUseCase(elections, audit).execute('election-1', { name: 'X' }, 'admin-1'),
      ).rejects.toBeInstanceOf(ElectionNotEditableError);
    }
    expect(elections.update.mock.calls).toHaveLength(0);
  });

  it('UC-9: rejects an invalid calendar date with ELECTION_INVALID_DATE', async () => {
    await expect(
      new UpdateElectionUseCase(elections, audit).execute(
        'election-1',
        { startDate: '2026-02-30' },
        'admin-1',
      ),
    ).rejects.toMatchObject({ code: 'ELECTION_INVALID_DATE' });
  });

  it('UC-10: rejects an invalid time with ELECTION_INVALID_TIME', async () => {
    await expect(
      new UpdateElectionUseCase(elections, audit).execute(
        'election-1',
        { startTime: '25:00:00' },
        'admin-1',
      ),
    ).rejects.toMatchObject({ code: 'ELECTION_INVALID_TIME' });
  });

  it('UC-11: rejects a resulting interval where start >= end (full, partial, equal)', async () => {
    await expect(
      new UpdateElectionUseCase(elections, audit).execute(
        'election-1',
        { endDate: '2026-09-30', endTime: '08:00:00' },
        'admin-1',
      ),
    ).rejects.toMatchObject({ code: 'ELECTION_INVALID_DATE_RANGE' });

    await expect(
      new UpdateElectionUseCase(elections, audit).execute(
        'election-1',
        { startTime: '19:00:00' },
        'admin-1',
      ),
    ).rejects.toMatchObject({ code: 'ELECTION_INVALID_DATE_RANGE' });

    await expect(
      new UpdateElectionUseCase(elections, audit).execute(
        'election-1',
        { endTime: '08:00:00' },
        'admin-1',
      ),
    ).rejects.toMatchObject({ code: 'ELECTION_INVALID_DATE_RANGE' });
  });

  it('UC-12: immutable fields (id, currentStatus, createdAt) are never changed', async () => {
    const original = buildEditableElection();
    await new UpdateElectionUseCase(elections, audit).execute(
      'election-1',
      { name: 'Changed' },
      'admin-1',
    );

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
        { name: 'Taken' },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(ElectionNameConflictError);
    expect(elections.update.mock.calls).toHaveLength(1);
  });

  it('UC-14: records an audit entry on success', async () => {
    await new UpdateElectionUseCase(elections, audit).execute(
      'election-1',
      { name: 'Renamed' },
      'admin-1',
    );

    expect(audit.log.mock.calls).toHaveLength(1);
    expect(audit.log.mock.calls[0]).toEqual([
      'ELECTION_UPDATED',
      'admin-1',
      { electionId: 'election-1' },
    ]);
  });

  it('UC-15: skips the audit log when requestingUserId is absent', async () => {
    await new UpdateElectionUseCase(elections, audit).execute(
      'election-1',
      { name: 'Renamed' },
      '',
    );

    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('UC-16: propagates unexpected repository failures unchanged', async () => {
    elections.update.mockRejectedValue(new Error('database exploded'));

    await expect(
      new UpdateElectionUseCase(elections, audit).execute(
        'election-1',
        { name: 'Renamed' },
        'admin-1',
      ),
    ).rejects.toThrow('database exploded');
  });
});
