import { BadRequestException } from 'src/shared/exceptions/base/bad-request.exception';
import { GetAuditLogsUseCase } from './get-audit-logs.use-case';
import type { AuditLogRepository } from '../../domain/repositories/audit-log.repository.interface';

describe('GetAuditLogsUseCase', () => {
  const auditLogs: jest.Mocked<Pick<AuditLogRepository, 'findAll'>> = {
    findAll: jest.fn(),
  };

  const record = {
    id: 'log-1',
    userId: 'user-1',
    action: 'USER_CREATED',
    reason: 'reason text',
    details: '{"userId":"user-1","a":1}',
    timestamp: new Date('2026-11-10T15:00:00.000Z'),
  };

  beforeEach(() => jest.clearAllMocks());

  it('uses default pagination when page/limit are absent', async () => {
    auditLogs.findAll.mockResolvedValue({ logs: [], total: 0 });
    const useCase = new GetAuditLogsUseCase(auditLogs);

    await useCase.execute({ page: undefined as never, limit: undefined as never });

    expect(auditLogs.findAll).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 10 }));
  });

  it('normalizes invalid page/limit values', async () => {
    auditLogs.findAll.mockResolvedValue({ logs: [], total: 0 });
    const useCase = new GetAuditLogsUseCase(auditLogs);

    await useCase.execute({ page: 0, limit: -1 });

    expect(auditLogs.findAll).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 10 }));
  });

  it('forwards page, limit and userId to the repository', async () => {
    auditLogs.findAll.mockResolvedValue({ logs: [], total: 0 });
    const useCase = new GetAuditLogsUseCase(auditLogs);

    await useCase.execute({ page: 2, limit: 5, userId: 'user-1' });

    expect(auditLogs.findAll).toHaveBeenCalledWith({
      page: 2,
      limit: 5,
      userId: 'user-1',
      startDate: undefined,
      endDate: undefined,
    });
  });

  it('converts startDate to inclusive UTC start-of-day', async () => {
    auditLogs.findAll.mockResolvedValue({ logs: [], total: 0 });
    const useCase = new GetAuditLogsUseCase(auditLogs);

    await useCase.execute({ page: 1, limit: 10, startDate: '2026-11-10' });

    expect(auditLogs.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: new Date('2026-11-10T00:00:00.000Z'),
      }),
    );
  });

  it('converts endDate to inclusive UTC end-of-day', async () => {
    auditLogs.findAll.mockResolvedValue({ logs: [], total: 0 });
    const useCase = new GetAuditLogsUseCase(auditLogs);

    await useCase.execute({ page: 1, limit: 10, endDate: '2026-11-10' });

    expect(auditLogs.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        endDate: new Date('2026-11-10T23:59:59.999Z'),
      }),
    );
  });

  it('accepts a same-day range', async () => {
    auditLogs.findAll.mockResolvedValue({ logs: [], total: 0 });
    const useCase = new GetAuditLogsUseCase(auditLogs);

    await useCase.execute({ page: 1, limit: 10, startDate: '2026-11-10', endDate: '2026-11-10' });

    expect(auditLogs.findAll).toHaveBeenCalled();
  });

  it('rejects an inverted date range before querying', async () => {
    const useCase = new GetAuditLogsUseCase(auditLogs);

    await expect(
      useCase.execute({ page: 1, limit: 10, startDate: '2026-11-11', endDate: '2026-11-10' }),
    ).rejects.toMatchObject({ code: 'AUDIT_LOG_INVALID_DATE_RANGE' });

    expect(auditLogs.findAll).not.toHaveBeenCalled();
  });

  it('rejects an impossible calendar date', async () => {
    const useCase = new GetAuditLogsUseCase(auditLogs);

    await expect(
      useCase.execute({ page: 1, limit: 10, startDate: '2026-02-30' }),
    ).rejects.toMatchObject({ code: 'AUDIT_LOG_INVALID_DATE' });

    expect(auditLogs.findAll).not.toHaveBeenCalled();
  });

  it('rejects a malformed date format', async () => {
    const useCase = new GetAuditLogsUseCase(auditLogs);

    await expect(
      useCase.execute({ page: 1, limit: 10, startDate: '10/11/2026' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(auditLogs.findAll).not.toHaveBeenCalled();
  });

  it('returns the repository result unchanged', async () => {
    auditLogs.findAll.mockResolvedValue({ logs: [record], total: 1 });
    const useCase = new GetAuditLogsUseCase(auditLogs);

    const result = await useCase.execute({ page: 1, limit: 10 });

    expect(result).toEqual({ logs: [record], total: 1 });
  });

  it('returns an empty result', async () => {
    auditLogs.findAll.mockResolvedValue({ logs: [], total: 0 });
    const useCase = new GetAuditLogsUseCase(auditLogs);

    const result = await useCase.execute({ page: 1, limit: 10 });

    expect(result).toEqual({ logs: [], total: 0 });
  });

  it('propagates repository failures without swallowing', async () => {
    auditLogs.findAll.mockRejectedValue(new Error('db down'));
    const useCase = new GetAuditLogsUseCase(auditLogs);

    await expect(useCase.execute({ page: 1, limit: 10 })).rejects.toThrow('db down');
  });
});
