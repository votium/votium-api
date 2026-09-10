import { ElectorEntity } from 'src/modules/electors/domain/entities/elector.entity';
import { ElectorNotFoundError } from 'src/modules/electors/domain/errors/elector-not-found.error';
import type { ElectorRepository } from 'src/modules/electors/domain/repositories/elector.repository.interface';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import { ElectionEntity } from 'src/modules/elections/domain/entities/election.entity';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectoralRollEntity } from '../../domain/entities/electoral-roll.entity';
import { ElectionNotModifiableError } from '../../domain/errors/election-not-modifiable.error';
import { ElectoralRollNotFoundError } from '../../domain/errors/electoral-roll-not-found.error';
import type { ElectoralRollRepository } from '../../domain/repositories/electoral-roll.repository.interface';
import {
  UPDATE_ELECTORAL_ROLL_ELECTOR_AUDIT_ACTION,
  UpdateElectoralRollElectorUseCase,
} from './update-electoral-roll-elector.use-case';

function buildElection(status: string): ElectionEntity {
  return ElectionEntity.restore({
    id: 'election-1',
    name: 'Student Council Election 2026',
    description: 'Election for the 2026 student council.',
    startDate: new Date(Date.UTC(2026, 9, 1)),
    startTime: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
    endDate: new Date(Date.UTC(2026, 9, 1)),
    endTime: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
    currentStatus: status as ElectionEntity['currentStatus'],
    blankVoteEnabled: false,
    createdAt: new Date('2026-08-19T15:00:00.000Z'),
  });
}

function buildElector(): ElectorEntity {
  return ElectorEntity.restore({
    id: 'elector-1',
    firstName: 'Juan Camilo',
    lastName: 'Garcia Saenz',
    email: 'juan.garcia@correounivalle.edu.co',
    passwordHash: 'pbkdf2$210000$salt$hash',
    studentCode: '202012345',
    programCode: '2710',
    status: ElectorEntity.DEFAULT_STATUS,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
  });
}

function buildRoll(electorId: string): ElectoralRollEntity {
  return ElectoralRollEntity.restore({
    id: 'roll-1',
    electionId: 'election-1',
    electorId,
    hasVoted: false,
    voteAttempts: 0,
    lastVoteAttempt: null,
    createdAt: new Date('2026-08-20T10:00:00.000Z'),
  });
}

describe('UpdateElectoralRollElectorUseCase', () => {
  const elections: jest.Mocked<ElectionRepository> = {
    findAll: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    hasCandidates: jest.fn(),
    hasVotes: jest.fn(),
    delete: jest.fn(),
  };

  const electors: jest.Mocked<ElectorRepository> = {
    create: jest.fn(),
    findByStudentCodeOrEmail: jest.fn(),
    findById: jest.fn(),
    updateStatus: jest.fn(),
    update: jest.fn(),
    findByEmail: jest.fn(),
    search: jest.fn(),
    findByStudentCodeAndProgramCode: jest.fn(),
  };

  const rolls: jest.Mocked<ElectoralRollRepository> = {
    findByElectionAndElectorIds: jest.fn(),
    createMany: jest.fn(),
    countByElection: jest.fn(),
    deleteByElectionAndElectorId: jest.fn(),
  };

  const audit: jest.Mocked<Pick<AuditLogPort, 'log'>> = {
    log: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  function makeUseCase(): UpdateElectoralRollElectorUseCase {
    return new UpdateElectoralRollElectorUseCase(elections, electors, rolls, audit);
  }

  const input = {
    electionId: 'election-1',
    electorId: 'elector-1',
    data: { firstName: 'Maria', programCode: '2715' },
    requestingUserId: 'user-1',
  };

  it('UU1: updates a PENDING election elector, persists the merged entity and audits', async () => {
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    electors.findById.mockResolvedValue(buildElector());
    rolls.findByElectionAndElectorIds.mockResolvedValue([buildRoll('elector-1')]);
    const persisted = buildElector();
    persisted.update({ firstName: 'Maria', programCode: '2715' });
    electors.update.mockResolvedValue(persisted);

    const result = await makeUseCase().execute(input);

    expect(result.firstName).toBe('Maria');
    expect(result.programCode).toBe('2715');
    expect(electors.update.mock.calls).toHaveLength(1);
    expect(audit.log.mock.calls[0]).toEqual([
      UPDATE_ELECTORAL_ROLL_ELECTOR_AUDIT_ACTION,
      'user-1',
      { electionId: 'election-1', electorId: 'elector-1' },
    ]);
  });

  it('UU2: throws ElectionNotFoundError when the election does not exist and does nothing else', async () => {
    elections.findById.mockResolvedValue(null);

    await expect(makeUseCase().execute(input)).rejects.toBeInstanceOf(ElectionNotFoundError);
    await expect(makeUseCase().execute(input)).rejects.toMatchObject({
      code: 'ELECTION_NOT_FOUND',
    });

    expect(electors.findById.mock.calls).toHaveLength(0);
    expect(rolls.findByElectionAndElectorIds.mock.calls).toHaveLength(0);
    expect(electors.update.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it.each(['CREATED', 'PUBLISHED', 'ACTIVE', 'CLOSED'])(
    'UU3: throws ElectionNotModifiableError when the election is %s',
    async (status) => {
      elections.findById.mockResolvedValue(buildElection(status));

      await expect(makeUseCase().execute(input)).rejects.toBeInstanceOf(ElectionNotModifiableError);
      await expect(makeUseCase().execute(input)).rejects.toMatchObject({
        code: 'ELECTION_NOT_MODIFIABLE',
      });

      expect(electors.findById.mock.calls).toHaveLength(0);
      expect(rolls.findByElectionAndElectorIds.mock.calls).toHaveLength(0);
      expect(electors.update.mock.calls).toHaveLength(0);
      expect(audit.log.mock.calls).toHaveLength(0);
    },
  );

  it('UU4: throws ElectorNotFoundError when the elector does not exist', async () => {
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    electors.findById.mockResolvedValue(null);

    await expect(makeUseCase().execute(input)).rejects.toBeInstanceOf(ElectorNotFoundError);
    await expect(makeUseCase().execute(input)).rejects.toMatchObject({
      code: 'ELECTOR_NOT_FOUND',
    });

    expect(rolls.findByElectionAndElectorIds.mock.calls).toHaveLength(0);
    expect(electors.update.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('UU5: throws ElectoralRollNotFoundError when the elector is not in this election roll and never persists', async () => {
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    electors.findById.mockResolvedValue(buildElector());
    rolls.findByElectionAndElectorIds.mockResolvedValue([]);

    const execution = makeUseCase().execute(input);
    await expect(execution).rejects.toBeInstanceOf(ElectoralRollNotFoundError);
    await expect(execution).rejects.toMatchObject({
      code: 'ELECTORAL_ROLL_NOT_FOUND',
    });

    expect(rolls.findByElectionAndElectorIds.mock.calls).toEqual([['election-1', ['elector-1']]]);
    expect(electors.update.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('UU6: throws ElectorNotFoundError when update() returns null (race) and does not audit', async () => {
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    electors.findById.mockResolvedValue(buildElector());
    rolls.findByElectionAndElectorIds.mockResolvedValue([buildRoll('elector-1')]);
    electors.update.mockResolvedValue(null);

    const execution = makeUseCase().execute(input);
    await expect(execution).rejects.toBeInstanceOf(ElectorNotFoundError);
    await expect(execution).rejects.toMatchObject({
      code: 'ELECTOR_NOT_FOUND',
    });

    expect(electors.update.mock.calls).toHaveLength(1);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('UU7: mutates the loaded elector with the partial data before persisting', async () => {
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    const elector = buildElector();
    electors.findById.mockResolvedValue(elector);
    rolls.findByElectionAndElectorIds.mockResolvedValue([buildRoll('elector-1')]);
    electors.update.mockResolvedValue(elector);

    await makeUseCase().execute(input);

    const persistedEntity = electors.update.mock.calls[0][0];
    expect(persistedEntity).toBe(elector);
    expect(persistedEntity.firstName).toBe('Maria');
    expect(persistedEntity.programCode).toBe('2715');
    expect(persistedEntity.lastName).toBe('Garcia Saenz');
  });

  it('UU8: delegates a no-op update (empty data) without touching any field', async () => {
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    const elector = buildElector();
    electors.findById.mockResolvedValue(elector);
    rolls.findByElectionAndElectorIds.mockResolvedValue([buildRoll('elector-1')]);
    electors.update.mockResolvedValue(elector);

    const result = await makeUseCase().execute({ ...input, data: {} });

    expect(result.firstName).toBe('Juan Camilo');
    expect(electors.update.mock.calls[0][0]).toBe(elector);
    expect(audit.log.mock.calls).toHaveLength(1);
  });

  it('UU9: audits only after a successful persistence', async () => {
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    electors.findById.mockResolvedValue(buildElector());
    rolls.findByElectionAndElectorIds.mockResolvedValue([buildRoll('elector-1')]);
    electors.update.mockResolvedValue(null);

    await expect(makeUseCase().execute(input)).rejects.toBeInstanceOf(ElectorNotFoundError);

    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('UU10: passes the exact ids to every read while it short-circuits', async () => {
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    electors.findById.mockResolvedValue(buildElector());
    rolls.findByElectionAndElectorIds.mockResolvedValue([buildRoll('elector-1')]);
    electors.update.mockResolvedValue(buildElector());

    await makeUseCase().execute(input);

    expect(elections.findById.mock.calls).toEqual([['election-1']]);
    expect(electors.findById.mock.calls).toEqual([['elector-1']]);
    expect(rolls.findByElectionAndElectorIds.mock.calls).toEqual([['election-1', ['elector-1']]]);
  });
});
