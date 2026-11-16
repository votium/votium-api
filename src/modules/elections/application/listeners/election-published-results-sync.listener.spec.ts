import { Logger } from '@nestjs/common';

// @nestjs/event-emitter ships as ESM, which this Jest setup cannot load; the decorator is
// irrelevant to the handler logic under test.
jest.mock('@nestjs/event-emitter', () => ({ OnEvent: () => () => undefined }));
import { ElectionPublishedEvent } from '../events/election-published.event';
import type { SynchronizeElectionResultsUseCase } from '../use-cases/synchronize-election-results.use-case';
import { ElectionPublishedResultsSyncListener } from './election-published-results-sync.listener';

describe('ElectionPublishedResultsSyncListener', () => {
  const execute = jest.fn();
  let errorSpy: jest.SpyInstance;
  let listener: ElectionPublishedResultsSyncListener;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    listener = new ElectionPublishedResultsSyncListener({
      execute,
    } as unknown as SynchronizeElectionResultsUseCase);
  });

  it('LS-01: runs the synchronization with the event electionId', async () => {
    execute.mockResolvedValue({ electionId: 'e-1', synchronized: true });

    await listener.handle(new ElectionPublishedEvent('e-1'));

    expect(execute).toHaveBeenCalledWith({ electionId: 'e-1' });
  });

  it('LS-02: swallows and logs a synchronization failure', async () => {
    execute.mockRejectedValue(new Error('fabric down'));

    await expect(listener.handle(new ElectionPublishedEvent('e-1'))).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('LS-03: depends only on the synchronization use case (no election repository)', () => {
    expect(ElectionPublishedResultsSyncListener.length).toBe(1);
  });
});
