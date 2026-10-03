import { ElectorEntity, UpdateElectorInput } from '../../domain/entities/elector.entity';
import { ElectorDuplicateError } from '../../domain/errors/elector-duplicate.error';
import { ElectorNotFoundError } from '../../domain/errors/elector-not-found.error';
import type { ElectorRepository } from '../../domain/repositories/elector.repository.interface';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { UpdateElectorUseCase } from './update-elector.use-case';

function buildElector(status = 'ACTIVE'): ElectorEntity {
  return ElectorEntity.restore({
    id: 'elector-1',
    firstName: 'Juan Camilo',
    lastName: 'Garcia Saenz',
    email: 'juan.garcia@correounivalle.edu.co',
    passwordHash: 'pbkdf2$210000$salt$hash',
    studentCode: '202012345',
    programCode: '2710',
    identification: '1001234567',
    status,
    createdAt: new Date('2026-08-19T15:00:00.000Z'),
    updatedAt: new Date('2026-08-19T15:00:00.000Z'),
  });
}

describe('UpdateElectorUseCase', () => {
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

  beforeEach(() => jest.clearAllMocks());

  function buildUseCase(): UpdateElectorUseCase {
    return new UpdateElectorUseCase(electors, audit);
  }

  const fullInput: UpdateElectorInput = {
    firstName: 'Maria',
    lastName: 'Rodriguez',
    email: 'maria.rodriguez@correounivalle.edu.co',
    studentCode: '202099999',
    programCode: '8010',
    identification: '2001234567',
  };

  it('EUU-01: updates an elector, persists it and logs the audit entry', async () => {
    const existing = buildElector();
    electors.findById.mockResolvedValue(existing);
    electors.update.mockResolvedValue(existing);

    const result = await buildUseCase().execute('elector-1', fullInput, 'admin-1');

    expect(result).toBe(existing);
    expect(electors.update.mock.calls).toHaveLength(1);
    expect(electors.update.mock.calls[0][0]).toBe(existing);
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith('ELECTOR_UPDATED', 'admin-1', {
      electorId: 'elector-1',
    });
  });

  it('EUU-02: full-field update overwrites every editable field including identification', async () => {
    const existing = buildElector();
    electors.findById.mockResolvedValue(existing);
    electors.update.mockResolvedValue(existing);

    const result = await buildUseCase().execute('elector-1', fullInput, 'admin-1');

    expect(result.firstName).toBe('Maria');
    expect(result.lastName).toBe('Rodriguez');
    expect(result.email).toBe('maria.rodriguez@correounivalle.edu.co');
    expect(result.studentCode).toBe('202099999');
    expect(result.programCode).toBe('8010');
    expect(result.identification).toBe('2001234567');
  });

  it('EUU-03: throws ElectorNotFoundError when the elector does not exist before any write', async () => {
    electors.findById.mockResolvedValue(null);

    await expect(
      buildUseCase().execute('missing', { firstName: 'X' }, 'admin-1'),
    ).rejects.toBeInstanceOf(ElectorNotFoundError);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(electors.update).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('EUU-04: throws ElectorNotFoundError when update returns null (race) without audit', async () => {
    electors.findById.mockResolvedValue(buildElector());
    electors.update.mockResolvedValue(null);

    await expect(buildUseCase().execute('elector-1', fullInput, 'admin-1')).rejects.toBeInstanceOf(
      ElectorNotFoundError,
    );

    expect(audit.log).not.toHaveBeenCalled();
  });

  it('EUU-05: propagates ElectorDuplicateError on a unique violation without audit', async () => {
    electors.findById.mockResolvedValue(buildElector());
    electors.update.mockRejectedValue(new ElectorDuplicateError());

    await expect(buildUseCase().execute('elector-1', fullInput, 'admin-1')).rejects.toBeInstanceOf(
      ElectorDuplicateError,
    );

    expect(audit.log).not.toHaveBeenCalled();
  });

  it('EUU-06: propagates unexpected repository errors unchanged without audit', async () => {
    const boom = new Error('database exploded');
    electors.findById.mockResolvedValue(buildElector());
    electors.update.mockRejectedValue(boom);

    await expect(buildUseCase().execute('elector-1', fullInput, 'admin-1')).rejects.toThrow(
      'database exploded',
    );

    expect(audit.log).not.toHaveBeenCalled();
  });

  it('EUU-07: an INACTIVE elector is updatable (no status guard)', async () => {
    const existing = buildElector('INACTIVE');
    electors.findById.mockResolvedValue(existing);
    electors.update.mockResolvedValue(existing);

    const result = await buildUseCase().execute('elector-1', fullInput, 'admin-1');

    expect(result.status).toBe('INACTIVE');
    expect(result.firstName).toBe('Maria');
  });

  it('EUU-08: updates and persists without auditing when requestingUserId is empty', async () => {
    const existing = buildElector();
    electors.findById.mockResolvedValue(existing);
    electors.update.mockResolvedValue(existing);

    await buildUseCase().execute('elector-1', fullInput, '');

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(electors.update).toHaveBeenCalledTimes(1);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('EUU-09: audits only after successful persistence', async () => {
    electors.findById.mockResolvedValue(buildElector());
    electors.update.mockResolvedValue(null);

    await expect(buildUseCase().execute('elector-1', fullInput, 'admin-1')).rejects.toBeInstanceOf(
      ElectorNotFoundError,
    );

    expect(audit.log).not.toHaveBeenCalled();
  });

  it('EUU-10: only calls findById and update, never the participation read', async () => {
    const existing = buildElector();
    electors.findById.mockResolvedValue(existing);
    electors.update.mockResolvedValue(existing);

    await buildUseCase().execute('elector-1', fullInput, 'admin-1');

    expect(electors.findById.mock.calls).toEqual([['elector-1']]);
    expect(electors.update.mock.calls).toHaveLength(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(electors.findElectionParticipation).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(electors.search).not.toHaveBeenCalled();
  });
});
