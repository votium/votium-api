// The invoker pulls the registry, @nestjs/config and the Gateway (ESM). These tests only need a fake of it.
jest.mock('../client/fabric-invoker', () => ({ FabricInvoker: class FabricInvoker { } }));

import { randomBytes, generateKeyPairSync } from 'node:crypto';
import { FabricInvoker } from '../client/fabric-invoker';
import { ElectionsService } from './elections.service';
import { VotersService } from './voters.service';
import { VotingService } from './voting.service';

const hex64 = (): string => randomBytes(32).toString('hex');
const publicPem = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .publicKey.export({ type: 'spki', format: 'pem' })
  .toString();

function fakeInvoker() {
  const invoker = {
    submit: jest.fn().mockResolvedValue({ data: {}, txId: 't', blockNumber: 1 }),
    evaluate: jest.fn().mockResolvedValue({}),
  };
  return { invoker, asInvoker: invoker as unknown as FabricInvoker };
}

describe('ElectionsService', () => {
  it('sends the arguments in the order the contract expects', async () => {
    const { invoker, asInvoker } = fakeInvoker();
    await new ElectionsService(asInvoker).createElection({
      electionId: 'E1',
      name: 'Rector',
      startDate: '2026-11-10T08:00:00-05:00',
      endDate: '2026-11-10T18:00:00-05:00',
      signingPublicKey: publicPem,
    });
    expect(invoker.submit).toHaveBeenCalledWith('elections', 'CreateElection', [
      'E1',
      'Rector',
      '2026-11-10T08:00:00-05:00',
      '2026-11-10T18:00:00-05:00',
      publicPem,
    ]);
  });

  it('does not touch the network when the end date is not after the start date', async () => {
    const { invoker, asInvoker } = fakeInvoker();
    await expect(
      new ElectionsService(asInvoker).createElection({
        electionId: 'E1',
        name: 'X',
        startDate: '2026-11-10T18:00:00Z',
        endDate: '2026-11-10T08:00:00Z',
        signingPublicKey: publicPem,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(invoker.submit).not.toHaveBeenCalled();
  });

  it('routes each transition to its function and reads with the requested profile', async () => {
    const { invoker, asInvoker } = fakeInvoker();
    const svc = new ElectionsService(asInvoker);
    await svc.startElection('E1');
    await svc.cancelElection('E1');
    await svc.closeElection('E1');
    await svc.publishElection('E1');
    expect(invoker.submit.mock.calls.map((c) => c[1])).toEqual([
      'StartElection',
      'CancelElection',
      'CloseElection',
      'PublishElection',
    ]);
    await svc.getElection('E1', { profile: 'auditor' });
    expect(invoker.evaluate).toHaveBeenCalledWith('elections', 'GetElection', ['E1'], 'auditor');
  });
});

describe('VotersService', () => {
  it('serialises the hash list as JSON', async () => {
    const { invoker, asInvoker } = fakeInvoker();
    const hashes = [hex64(), hex64()];
    await new VotersService(asInvoker).markVotedBatch({ electionId: 'E1', voterHashes: hashes });
    expect(invoker.submit).toHaveBeenCalledWith('voters', 'MarkVotedBatch', [
      'E1',
      JSON.stringify(hashes),
    ]);
  });

  it('rejects an invalid hash before sending', async () => {
    const { invoker, asInvoker } = fakeInvoker();
    await expect(
      new VotersService(asInvoker).issueToken({ electionId: 'E1', voterHash: 'abc' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(invoker.submit).not.toHaveBeenCalled();
  });
});

describe('VotingService.getVotesByElection', () => {
  it('sends only the arguments that were provided', async () => {
    const { invoker, asInvoker } = fakeInvoker();
    const svc = new VotingService(asInvoker);
    await svc.getVotesByElection({ electionId: 'E1' });
    await svc.getVotesByElection({ electionId: 'E1', pageSize: 50 });
    await svc.getVotesByElection({ electionId: 'E1', bookmark: 'bm' });
    await svc.getVotesByElection({ electionId: 'E1', pageSize: 50, bookmark: 'bm' });
    expect(invoker.evaluate.mock.calls.map((c) => c[2])).toEqual([
      ['E1'],
      ['E1', '50'],
      ['E1', '200', 'bm'],
      ['E1', '50', 'bm'],
    ]);
  });
});
