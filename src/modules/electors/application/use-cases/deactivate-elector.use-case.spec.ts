import { DeactivateElectorUseCase } from './deactivate-elector.use-case';
import { ElectorAlreadyInactiveError } from '../../domain/errors/elector-already-inactive.error';
import { ElectorNotFoundError } from '../../domain/errors/elector-not-found.error';
import { ElectorEntity } from '../../domain/entities/elector.entity';
import type { ElectorRepository } from '../../domain/repositories/elector.repository.interface';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';

describe('DeactivateElectorUseCase', () => {
  const electors: jest.Mocked<ElectorRepository> = {
    create: jest.fn(),
    findByStudentCodeOrEmail: jest.fn(),
    findById: jest.fn(),
    updateStatus: jest.fn(),
    search: jest.fn(),
  };
  const audit: jest.Mocked<Pick<AuditLogPort, 'log'>> = {
    log: jest.fn(),
  };

  const id = 'elector-1';
  const requestingUserId = 'user-1';

  beforeEach(() => jest.clearAllMocks());

  function activeElector(): ElectorEntity {
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
    });
  }

  function inactiveElector(): ElectorEntity {
    return ElectorEntity.restore({
      id,
      firstName: 'Juan Camilo',
      lastName: 'Garcia Saenz',
      email: 'juan.garcia@correounivalle.edu.co',
      passwordHash: 'pbkdf2$210000$salt$hash',
      studentCode: '202012345',
      programCode: '2710',
      status: ElectorEntity.INACTIVE_STATUS,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
    });
  }

  it('U1: deactivates an active elector, persists the status and logs audit', async () => {
    electors.findById.mockResolvedValue(activeElector());
    electors.updateStatus.mockResolvedValue(inactiveElector());
    const useCase = new DeactivateElectorUseCase(electors, audit);

    await useCase.execute(id, requestingUserId);

    expect(electors.findById.mock.calls[0]).toEqual([id]);
    expect(electors.updateStatus.mock.calls[0]).toEqual([id, ElectorEntity.INACTIVE_STATUS]);
    expect(audit.log.mock.calls[0]).toEqual([
      'ELECTOR_DEACTIVATED',
      requestingUserId,
      { electorId: id },
    ]);
  });

  it('U2: throws ElectorNotFoundError when the elector does not exist and does nothing else', async () => {
    electors.findById.mockResolvedValue(null);
    const useCase = new DeactivateElectorUseCase(electors, audit);

    await expect(useCase.execute('missing', requestingUserId)).rejects.toBeInstanceOf(
      ElectorNotFoundError,
    );

    expect(electors.updateStatus.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('U3: propagates ElectorAlreadyInactiveError when already inactive and does nothing else', async () => {
    electors.findById.mockResolvedValue(inactiveElector());
    const useCase = new DeactivateElectorUseCase(electors, audit);

    await expect(useCase.execute(id, requestingUserId)).rejects.toBeInstanceOf(
      ElectorAlreadyInactiveError,
    );

    expect(electors.updateStatus.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('U4: throws ElectorNotFoundError when updateStatus returns null (race) and does not log audit', async () => {
    electors.findById.mockResolvedValue(activeElector());
    electors.updateStatus.mockResolvedValue(null);
    const useCase = new DeactivateElectorUseCase(electors, audit);

    await expect(useCase.execute(id, requestingUserId)).rejects.toBeInstanceOf(
      ElectorNotFoundError,
    );

    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('U5: propagates a repository failure and does not log audit', async () => {
    electors.findById.mockResolvedValue(activeElector());
    const repositoryError = new Error('database unavailable');
    electors.updateStatus.mockRejectedValue(repositoryError);
    const useCase = new DeactivateElectorUseCase(electors, audit);

    await expect(useCase.execute(id, requestingUserId)).rejects.toBe(repositoryError);

    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('U6: only calls findById and updateStatus, never create or findByStudentCodeOrEmail', async () => {
    electors.findById.mockResolvedValue(activeElector());
    electors.updateStatus.mockResolvedValue(inactiveElector());
    const useCase = new DeactivateElectorUseCase(electors, audit);

    await useCase.execute(id, requestingUserId);

    expect(electors.findById.mock.calls).toHaveLength(1);
    expect(electors.updateStatus.mock.calls).toHaveLength(1);
    expect(electors.create.mock.calls).toHaveLength(0);
    expect(electors.findByStudentCodeOrEmail.mock.calls).toHaveLength(0);
  });

  it('U7: propagates the requestingUserId to the audit log', async () => {
    electors.findById.mockResolvedValue(activeElector());
    electors.updateStatus.mockResolvedValue(inactiveElector());
    const useCase = new DeactivateElectorUseCase(electors, audit);

    await useCase.execute(id, 'auditor-42');

    expect(audit.log.mock.calls[0]).toEqual([
      'ELECTOR_DEACTIVATED',
      'auditor-42',
      { electorId: id },
    ]);
  });
});
