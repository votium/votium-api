import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectionEntity } from '../../domain/entities/election.entity';
import { ElectionCodeExhaustedError } from '../../domain/errors/election-code-exhausted.error';
import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';
import { CreateElectionUseCase } from './create-election.use-case';

function buildElection(over: Partial<Parameters<typeof ElectionEntity.restore>[0]> = {}) {
  return ElectionEntity.restore({
    id: 'election-1',
    electionCode: 'ELECTION-102026-0001',
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

describe('CreateElectionUseCase', () => {
  const elections: jest.Mocked<ElectionRepository> = {
    nextElectionCode: jest.fn(),
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
  const audit: jest.Mocked<Pick<AuditLogPort, 'log'>> = { log: jest.fn() };

  const validInput = {
    name: 'Student Council Election 2026',
    description: 'Election for the 2026 student council.',
    startDate: '2026-10-01',
    startTime: '08:00:00',
    endDate: '2026-10-01',
    endTime: '18:00:00',
    blankVoteEnabled: false,
    requestingUserId: 'admin-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    elections.nextElectionCode.mockResolvedValue('ELECTION-102026-0001');
    elections.create.mockImplementation((entity) =>
      Promise.resolve(buildElection({ electionCode: entity.electionCode })),
    );
  });

  it('U-UC-01/U-UC-02: requests the next code with a Date', async () => {
    await new CreateElectionUseCase(elections, audit).execute(validInput);

    expect(elections.nextElectionCode.mock.calls).toHaveLength(1);
    expect(elections.nextElectionCode.mock.calls[0][0]).toBeInstanceOf(Date);
  });

  it('U-UC-03/U-UC-04: assigns and returns the generated code', async () => {
    const result = await new CreateElectionUseCase(elections, audit).execute(validInput);

    expect(elections.create.mock.calls[0][0].electionCode).toBe('ELECTION-102026-0001');
    expect(result.electionCode).toBe('ELECTION-102026-0001');
  });

  it('U-UC-05: logs ELECTION_CREATED with the election id', async () => {
    await new CreateElectionUseCase(elections, audit).execute(validInput);

    expect(audit.log.mock.calls).toEqual([
      ['ELECTION_CREATED', 'admin-1', { electionId: 'election-1' }],
    ]);
  });

  it('U-UC-06: propagates code exhaustion without persisting', async () => {
    elections.nextElectionCode.mockRejectedValue(new ElectionCodeExhaustedError('102026'));

    await expect(
      new CreateElectionUseCase(elections, audit).execute(validInput),
    ).rejects.toBeInstanceOf(ElectionCodeExhaustedError);
    expect(elections.create.mock.calls).toHaveLength(0);
  });

  it('U-UC-07: validates the interval before allocating a code', async () => {
    await expect(
      new CreateElectionUseCase(elections, audit).execute({
        ...validInput,
        endDate: '2026-09-01',
        endTime: '08:00:00',
      }),
    ).rejects.toThrow();
    expect(elections.nextElectionCode.mock.calls).toHaveLength(0);
  });
});
