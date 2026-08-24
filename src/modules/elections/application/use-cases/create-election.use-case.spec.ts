import { ElectionEntity } from '../../domain/entities/election.entity';
import { ElectionNameConflictError } from '../../domain/errors/election-name-conflict.error';
import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { BadRequestException } from 'src/shared/exceptions/base/bad-request.exception';
import { CreateElectionUseCase } from './create-election.use-case';

function buildSavedElection(): ElectionEntity {
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
  });
}

describe('CreateElectionUseCase', () => {
  const elections: jest.Mocked<ElectionRepository> = {
    create: jest.fn(),
  };
  const audit: jest.Mocked<Pick<AuditLogPort, 'log'>> = {
    log: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  const validInput = () => ({
    name: 'Student Council Election 2026',
    description: 'Election for the 2026 student council.',
    startDate: '2026-10-01',
    startTime: '08:00:00',
    endDate: '2026-10-01',
    endTime: '18:00:00',
    blankVoteEnabled: false,
    requestingUserId: 'admin-1',
  });

  it('creates and persists an election with CREATED status and default blank vote disabled', async () => {
    elections.create.mockResolvedValue(buildSavedElection());
    const useCase = new CreateElectionUseCase(elections, audit);

    const result = await useCase.execute(validInput());

    expect(result.currentStatus).toBe('CREATED');
    expect(result.blankVoteEnabled).toBe(false);
    expect(elections.create.mock.calls).toHaveLength(1);

    const persisted = elections.create.mock.calls[0][0];
    expect(persisted).toBeInstanceOf(ElectionEntity);
    expect(persisted.id).toBeNull();
    expect(persisted.currentStatus).toBe('CREATED');
  });

  it('returns the saved entity with Prisma-generated id and createdAt', async () => {
    const saved = buildSavedElection();
    elections.create.mockResolvedValue(saved);
    const useCase = new CreateElectionUseCase(elections, audit);

    const result = await useCase.execute(validInput());

    expect(result).toBe(saved);
    expect(result.id).toBe('election-1');
    expect(result.createdAt).toEqual(new Date('2026-08-19T15:00:00.000Z'));
  });

  it('trims name and description before persistence', async () => {
    elections.create.mockResolvedValue(buildSavedElection());
    const useCase = new CreateElectionUseCase(elections, audit);

    await useCase.execute({ ...validInput(), name: '  Name  ', description: '  Desc  ' });

    const persisted = elections.create.mock.calls[0][0];
    expect(persisted.name).toBe('Name');
    expect(persisted.description).toBe('Desc');
  });

  it('persists an explicit blankVoteEnabled true', async () => {
    elections.create.mockResolvedValue(buildSavedElection());
    const useCase = new CreateElectionUseCase(elections, audit);

    await useCase.execute({ ...validInput(), blankVoteEnabled: true });

    expect(elections.create.mock.calls[0][0].blankVoteEnabled).toBe(true);
  });

  it('accepts a valid interval where start is before end', async () => {
    elections.create.mockResolvedValue(buildSavedElection());
    const useCase = new CreateElectionUseCase(elections, audit);

    await expect(useCase.execute(validInput())).resolves.toBeDefined();
  });

  it('rejects when start date/time is equal to end date/time', async () => {
    elections.create.mockResolvedValue(buildSavedElection());
    const useCase = new CreateElectionUseCase(elections, audit);

    await expect(
      useCase.execute({ ...validInput(), endDate: '2026-10-01', endTime: '08:00:00' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when start is after end', async () => {
    elections.create.mockResolvedValue(buildSavedElection());
    const useCase = new CreateElectionUseCase(elections, audit);

    await expect(
      useCase.execute({ ...validInput(), endDate: '2026-09-30', endTime: '08:00:00' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an invalid calendar date', async () => {
    elections.create.mockResolvedValue(buildSavedElection());
    const useCase = new CreateElectionUseCase(elections, audit);

    await expect(
      useCase.execute({ ...validInput(), startDate: '2026-02-30' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('propagates a name conflict as ElectionNameConflictError', async () => {
    elections.create.mockRejectedValue(new ElectionNameConflictError());
    const useCase = new CreateElectionUseCase(elections, audit);

    await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(ElectionNameConflictError);
  });

  it('propagates unexpected repository failures unchanged', async () => {
    elections.create.mockRejectedValue(new Error('database exploded'));
    const useCase = new CreateElectionUseCase(elections, audit);

    await expect(useCase.execute(validInput())).rejects.toThrow('database exploded');
  });

  it('records an audit entry on success', async () => {
    elections.create.mockResolvedValue(buildSavedElection());
    const useCase = new CreateElectionUseCase(elections, audit);

    await useCase.execute(validInput());

    expect(audit.log.mock.calls).toHaveLength(1);
    expect(audit.log.mock.calls[0]).toEqual([
      'ELECTION_CREATED',
      'admin-1',
      { electionId: 'election-1' },
    ]);
  });

  it('skips the audit log when requestingUserId is absent', async () => {
    elections.create.mockResolvedValue(buildSavedElection());
    const useCase = new CreateElectionUseCase(elections, audit);

    await useCase.execute({ ...validInput(), requestingUserId: '' });

    expect(audit.log.mock.calls).toHaveLength(0);
  });
});
