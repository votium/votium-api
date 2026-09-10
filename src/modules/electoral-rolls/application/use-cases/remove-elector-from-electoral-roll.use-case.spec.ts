import { ElectorEntity } from 'src/modules/electors/domain/entities/elector.entity';
import { ElectorNotFoundError } from 'src/modules/electors/domain/errors/elector-not-found.error';
import type { ElectorRepository } from 'src/modules/electors/domain/repositories/elector.repository.interface';
import { ElectionEntity } from 'src/modules/elections/domain/entities/election.entity';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectionNotModifiableError } from '../../domain/errors/election-not-modifiable.error';
import { ElectoralRollNotFoundError } from '../../domain/errors/electoral-roll-not-found.error';
import type { ElectoralRollRepository } from '../../domain/repositories/electoral-roll.repository.interface';
import {
  REMOVE_ELECTORAL_ROLL_ELECTOR_AUDIT_ACTION,
  RemoveElectorFromElectoralRollUseCase,
} from './remove-elector-from-electoral-roll.use-case';

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

describe('RemoveElectorFromElectoralRollUseCase', () => {
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

  function makeUseCase(): RemoveElectorFromElectoralRollUseCase {
    return new RemoveElectorFromElectoralRollUseCase(elections, electors, rolls, audit);
  }

  const input = {
    electionId: 'election-1',
    electorId: 'elector-1',
    requestingUserId: 'user-1',
  };

  it('UR1: removes the association only and audits without touching the elector row', async () => {
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    electors.findById.mockResolvedValue(buildElector());
    rolls.deleteByElectionAndElectorId.mockResolvedValue(true);

    await makeUseCase().execute(input);

    expect(rolls.deleteByElectionAndElectorId.mock.calls).toEqual([['election-1', 'elector-1']]);
    expect(electors.update.mock.calls).toHaveLength(0);
    expect(electors.updateStatus.mock.calls).toHaveLength(0);
    expect(electors.create.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toEqual([
      [
        REMOVE_ELECTORAL_ROLL_ELECTOR_AUDIT_ACTION,
        'user-1',
        { electionId: 'election-1', electorId: 'elector-1' },
      ],
    ]);
  });

  it('UR2: throws ElectionNotFoundError when the election does not exist and does nothing else', async () => {
    elections.findById.mockResolvedValue(null);

    await expect(makeUseCase().execute(input)).rejects.toBeInstanceOf(ElectionNotFoundError);
    await expect(makeUseCase().execute(input)).rejects.toMatchObject({
      code: 'ELECTION_NOT_FOUND',
    });

    expect(electors.findById.mock.calls).toHaveLength(0);
    expect(rolls.deleteByElectionAndElectorId.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it.each(['CREATED', 'PUBLISHED', 'ACTIVE', 'CLOSED'])(
    'UR3: throws ElectionNotModifiableError when the election is %s',
    async (status) => {
      elections.findById.mockResolvedValue(buildElection(status));

      await expect(makeUseCase().execute(input)).rejects.toBeInstanceOf(ElectionNotModifiableError);
      await expect(makeUseCase().execute(input)).rejects.toMatchObject({
        code: 'ELECTION_NOT_MODIFIABLE',
      });

      expect(electors.findById.mock.calls).toHaveLength(0);
      expect(rolls.deleteByElectionAndElectorId.mock.calls).toHaveLength(0);
      expect(audit.log.mock.calls).toHaveLength(0);
    },
  );

  it('UR4: throws ElectorNotFoundError when the elector does not exist', async () => {
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    electors.findById.mockResolvedValue(null);

    await expect(makeUseCase().execute(input)).rejects.toBeInstanceOf(ElectorNotFoundError);
    await expect(makeUseCase().execute(input)).rejects.toMatchObject({
      code: 'ELECTOR_NOT_FOUND',
    });

    expect(rolls.deleteByElectionAndElectorId.mock.calls).toHaveLength(0);
    expect(electors.update.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('UR5: throws ElectoralRollNotFoundError when no association exists and audits nothing', async () => {
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    electors.findById.mockResolvedValue(buildElector());
    rolls.deleteByElectionAndElectorId.mockResolvedValue(false);

    const execution = makeUseCase().execute(input);
    await expect(execution).rejects.toBeInstanceOf(ElectoralRollNotFoundError);
    await expect(execution).rejects.toMatchObject({
      code: 'ELECTORAL_ROLL_NOT_FOUND',
    });

    expect(rolls.deleteByElectionAndElectorId.mock.calls).toEqual([['election-1', 'elector-1']]);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('UR6: audits with the exact action and identifiers after a successful removal', async () => {
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    electors.findById.mockResolvedValue(buildElector());
    rolls.deleteByElectionAndElectorId.mockResolvedValue(true);

    await makeUseCase().execute(input);

    expect(audit.log.mock.calls).toEqual([
      [
        REMOVE_ELECTORAL_ROLL_ELECTOR_AUDIT_ACTION,
        'user-1',
        { electionId: 'election-1', electorId: 'elector-1' },
      ],
    ]);
  });

  it('UR7: only ever reads the elector row, never mutates it', async () => {
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    electors.findById.mockResolvedValue(buildElector());
    rolls.deleteByElectionAndElectorId.mockResolvedValue(true);

    await makeUseCase().execute(input);

    expect(electors.findById.mock.calls).toHaveLength(1);
    expect(electors.update.mock.calls).toHaveLength(0);
    expect(electors.updateStatus.mock.calls).toHaveLength(0);
  });

  it('UR8: passes the exact ids to every read and the delete operation', async () => {
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    electors.findById.mockResolvedValue(buildElector());
    rolls.deleteByElectionAndElectorId.mockResolvedValue(true);

    await makeUseCase().execute(input);

    expect(elections.findById.mock.calls).toEqual([['election-1']]);
    expect(electors.findById.mock.calls).toEqual([['elector-1']]);
    expect(rolls.deleteByElectionAndElectorId.mock.calls).toEqual([['election-1', 'elector-1']]);
  });
});
