import { ElectorEntity } from '../../domain/entities/elector.entity';
import { ElectorAlreadyActiveError } from '../../domain/errors/elector-already-active.error';
import { ElectorNotFoundError } from '../../domain/errors/elector-not-found.error';
import type { ElectorRepository } from '../../domain/repositories/elector.repository.interface';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ActivateElectorUseCase } from './activate-elector.use-case';

describe('ActivateElectorUseCase', () => {
  const electors: jest.Mocked<ElectorRepository> = {
    create: jest.fn(),
    findByStudentCodeOrEmail: jest.fn(),
    findById: jest.fn(),
    softDelete: jest.fn(),
    updateStatus: jest.fn(),
    update: jest.fn(),
    findByEmail: jest.fn(),
    search: jest.fn(),
    findByStudentCodeAndProgramCode: jest.fn(),
  };
  const audit: jest.Mocked<Pick<AuditLogPort, 'log'>> = {
    log: jest.fn(),
  };

  const id = 'elector-1';
  const requestingUserId = 'user-1';
  const createdAt = new Date('2026-08-01T00:00:00.000Z');

  beforeEach(() => jest.clearAllMocks());

  function electorWithStatus(status: string): ElectorEntity {
    return ElectorEntity.restore({
      id,
      firstName: 'Juan Camilo',
      lastName: 'Garcia Saenz',
      email: 'juan.garcia@correounivalle.edu.co',
      passwordHash: 'pbkdf2$210000$salt$hash',
      studentCode: '202012345',
      programCode: '2710',
      status,
      createdAt,
      deletedAt: null,
    });
  }

  function buildUseCase(): ActivateElectorUseCase {
    return new ActivateElectorUseCase(electors, audit);
  }

  it('AE-1: activates an INACTIVE elector and logs the audit entry', async () => {
    electors.findById.mockResolvedValue(electorWithStatus(ElectorEntity.INACTIVE_STATUS));
    electors.updateStatus.mockResolvedValue(electorWithStatus(ElectorEntity.DEFAULT_STATUS));

    const result = await buildUseCase().execute(id, requestingUserId);

    expect(result.status).toBe(ElectorEntity.DEFAULT_STATUS);
    expect(result.status).toBe('ACTIVE');
    expect(electors.findById.mock.calls[0]).toEqual([id]);
    expect(electors.updateStatus.mock.calls[0]).toEqual([id, ElectorEntity.DEFAULT_STATUS]);
    expect(audit.log.mock.calls[0]).toEqual([
      'ELECTOR_ACTIVATED',
      requestingUserId,
      { electorId: id },
    ]);
  });

  it('AE-2: throws ElectorNotFoundError when the elector does not exist', async () => {
    electors.findById.mockResolvedValue(null);

    await expect(buildUseCase().execute('missing', requestingUserId)).rejects.toBeInstanceOf(
      ElectorNotFoundError,
    );

    expect(electors.updateStatus.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('AE-3: throws ElectorAlreadyActiveError when the elector is already ACTIVE', async () => {
    electors.findById.mockResolvedValue(electorWithStatus(ElectorEntity.DEFAULT_STATUS));

    await expect(buildUseCase().execute(id, requestingUserId)).rejects.toBeInstanceOf(
      ElectorAlreadyActiveError,
    );

    expect(electors.updateStatus.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('AE-4: throws ElectorNotFoundError when updateStatus returns null (race) and does not log', async () => {
    electors.findById.mockResolvedValue(electorWithStatus(ElectorEntity.INACTIVE_STATUS));
    electors.updateStatus.mockResolvedValue(null);

    await expect(buildUseCase().execute(id, requestingUserId)).rejects.toBeInstanceOf(
      ElectorNotFoundError,
    );

    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('AE-5: propagates a repository failure and does not log audit', async () => {
    electors.findById.mockResolvedValue(electorWithStatus(ElectorEntity.INACTIVE_STATUS));
    const repositoryError = new Error('database unavailable');
    electors.updateStatus.mockRejectedValue(repositoryError);

    await expect(buildUseCase().execute(id, requestingUserId)).rejects.toBe(repositoryError);

    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('AE-6: only calls findById and updateStatus', async () => {
    electors.findById.mockResolvedValue(electorWithStatus(ElectorEntity.INACTIVE_STATUS));
    electors.updateStatus.mockResolvedValue(electorWithStatus(ElectorEntity.DEFAULT_STATUS));

    await buildUseCase().execute(id, requestingUserId);

    expect(electors.findById.mock.calls).toHaveLength(1);
    expect(electors.updateStatus.mock.calls).toHaveLength(1);
    expect(electors.create.mock.calls).toHaveLength(0);
    expect(electors.search.mock.calls).toHaveLength(0);
    expect(electors.softDelete.mock.calls).toHaveLength(0);
  });

  it('AE-7: preserves all other fields and only changes the status', async () => {
    electors.findById.mockResolvedValue(electorWithStatus(ElectorEntity.INACTIVE_STATUS));
    electors.updateStatus.mockResolvedValue(electorWithStatus(ElectorEntity.DEFAULT_STATUS));

    const result = await buildUseCase().execute(id, requestingUserId);

    expect(result.id).toBe(id);
    expect(result.firstName).toBe('Juan Camilo');
    expect(result.lastName).toBe('Garcia Saenz');
    expect(result.email).toBe('juan.garcia@correounivalle.edu.co');
    expect(result.passwordHash).toBe('pbkdf2$210000$salt$hash');
    expect(result.studentCode).toBe('202012345');
    expect(result.programCode).toBe('2710');
    expect(result.createdAt).toEqual(createdAt);
    expect(result.status).toBe('ACTIVE');
  });
});
