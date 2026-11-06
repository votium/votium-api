import { ElectorEntity } from '../../domain/entities/elector.entity';
import { ElectorNotFoundError } from '../../domain/errors/elector-not-found.error';
import type { ElectorRepository } from '../../domain/repositories/elector.repository.interface';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { DeleteElectorUseCase } from './delete-elector.use-case';

describe('DeleteElectorUseCase', () => {
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
    findElectionParticipation: jest.fn(),
  };
  const audit: jest.Mocked<Pick<AuditLogPort, 'log'>> = {
    log: jest.fn(),
  };

  const id = 'elector-1';
  const requestingUserId = 'user-1';

  beforeEach(() => jest.clearAllMocks());

  function existingElector(): ElectorEntity {
    return ElectorEntity.restore({
      id,
      firstName: 'Juan Camilo',
      lastName: 'Garcia Saenz',
      email: 'juan.garcia@correounivalle.edu.co',
      passwordHash: 'pbkdf2$210000$salt$hash',
      studentCode: '202012345',
      programCode: '2710',
      status: ElectorEntity.DEFAULT_STATUS,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      deletedAt: null,
    });
  }

  function buildUseCase(): DeleteElectorUseCase {
    return new DeleteElectorUseCase(electors, audit);
  }

  it('DE-1: deletes an existing elector and logs the audit entry', async () => {
    electors.findById.mockResolvedValue(existingElector());
    electors.softDelete.mockResolvedValue(existingElector());

    const result = await buildUseCase().execute(id, requestingUserId);

    expect(result).toBeUndefined();
    expect(electors.findById.mock.calls[0]).toEqual([id]);
    expect(electors.softDelete.mock.calls[0]).toEqual([id]);
    expect(audit.log.mock.calls[0]).toEqual([
      'ELECTOR_DELETED',
      requestingUserId,
      { electorId: id },
    ]);
  });

  it('DE-2: throws ElectorNotFoundError when the elector does not exist', async () => {
    electors.findById.mockResolvedValue(null);

    await expect(buildUseCase().execute('missing', requestingUserId)).rejects.toBeInstanceOf(
      ElectorNotFoundError,
    );

    expect(electors.softDelete.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('DE-3: throws ElectorNotFoundError when softDelete returns null (race) and does not log', async () => {
    electors.findById.mockResolvedValue(existingElector());
    electors.softDelete.mockResolvedValue(null);

    await expect(buildUseCase().execute(id, requestingUserId)).rejects.toBeInstanceOf(
      ElectorNotFoundError,
    );

    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('DE-4: propagates a repository failure and does not log audit', async () => {
    electors.findById.mockResolvedValue(existingElector());
    const repositoryError = new Error('database unavailable');
    electors.softDelete.mockRejectedValue(repositoryError);

    await expect(buildUseCase().execute(id, requestingUserId)).rejects.toBe(repositoryError);

    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('DE-5: only calls findById and softDelete', async () => {
    electors.findById.mockResolvedValue(existingElector());
    electors.softDelete.mockResolvedValue(existingElector());

    await buildUseCase().execute(id, requestingUserId);

    expect(electors.findById.mock.calls).toHaveLength(1);
    expect(electors.softDelete.mock.calls).toHaveLength(1);
    expect(electors.create.mock.calls).toHaveLength(0);
    expect(electors.search.mock.calls).toHaveLength(0);
    expect(electors.updateStatus.mock.calls).toHaveLength(0);
    expect(electors.update.mock.calls).toHaveLength(0);
  });

  it('DE-6: skips the audit log when requestingUserId is absent', async () => {
    electors.findById.mockResolvedValue(existingElector());
    electors.softDelete.mockResolvedValue(existingElector());

    await buildUseCase().execute(id, '');

    expect(audit.log.mock.calls).toHaveLength(0);
  });
});
