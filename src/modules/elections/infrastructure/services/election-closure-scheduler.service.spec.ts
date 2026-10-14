import { Logger } from '@nestjs/common';
import { envs } from 'src/config';
import type { CloseExpiredElectionsUseCase } from '../../application/use-cases/close-expired-elections.use-case';
import { ElectionClosureSchedulerService } from './election-closure-scheduler.service';

// Thin adapter under test: constructs the service directly with a mocked use case.
// The @Cron decorator is metadata only and is not exercised here.
describe('ElectionClosureSchedulerService', () => {
  const emptyResult = {
    evaluated: 0,
    eligible: 0,
    closed: 0,
    alreadyClosed: 0,
    failed: [],
  };

  let execute: jest.Mock;
  let service: ElectionClosureSchedulerService;
  let errorSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    execute = jest.fn().mockResolvedValue(emptyResult);
    const useCase = { execute } as unknown as CloseExpiredElectionsUseCase;
    service = new ElectionClosureSchedulerService(useCase);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('SC-1: does not call the use case when electionAutoCloseEnabled is false', async () => {
    const original = envs.electionAutoCloseEnabled;
    (envs as { electionAutoCloseEnabled: boolean }).electionAutoCloseEnabled = false;

    await service.handleTick();

    (envs as { electionAutoCloseEnabled: boolean }).electionAutoCloseEnabled = original;
    expect(execute).not.toHaveBeenCalled();
  });

  it('SC-2: calls the use case exactly once when electionAutoCloseEnabled is true', async () => {
    const original = envs.electionAutoCloseEnabled;
    (envs as { electionAutoCloseEnabled: boolean }).electionAutoCloseEnabled = true;

    await service.handleTick();

    (envs as { electionAutoCloseEnabled: boolean }).electionAutoCloseEnabled = original;
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('SC-3: surfaces each per-election failure through the logger with the election id', async () => {
    const original = envs.electionAutoCloseEnabled;
    (envs as { electionAutoCloseEnabled: boolean }).electionAutoCloseEnabled = true;
    execute.mockResolvedValue({
      ...emptyResult,
      failed: [{ electionId: 'election-1', error: new Error('row locked') }],
    });

    await service.handleTick();

    (envs as { electionAutoCloseEnabled: boolean }).electionAutoCloseEnabled = original;
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [firstArg] = errorSpy.mock.calls[0] as [unknown];
    expect(String(firstArg)).toContain('election-1');
  });

  it('SC-4: logs a run-level execute() rejection instead of letting it become an unhandled rejection', async () => {
    const original = envs.electionAutoCloseEnabled;
    (envs as { electionAutoCloseEnabled: boolean }).electionAutoCloseEnabled = true;
    execute.mockRejectedValue(new Error('database down'));

    await expect(service.handleTick()).resolves.toBeUndefined();

    (envs as { electionAutoCloseEnabled: boolean }).electionAutoCloseEnabled = original;
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [firstArg] = errorSpy.mock.calls[0] as [unknown];
    expect(String(firstArg)).toContain('database down');
  });
});
