/* eslint-disable @typescript-eslint/unbound-method */
import type { VotersService } from 'src/fabric/services/voters.service';
import type { VoterHasherPort } from 'src/shared/domain/ports/voter-hasher.port';
import { FabricVoterParticipationAdapter } from './fabric-voter-participation.adapter';

// The real VotersService pulls ESM-only Fabric dependencies; only its type is needed here.
jest.mock('src/fabric/services/voters.service', () => ({ VotersService: class {} }));

describe('FabricVoterParticipationAdapter', () => {
  let voters: jest.Mocked<Pick<VotersService, 'getVoterStatus'>>;
  let hasher: jest.Mocked<VoterHasherPort>;
  let adapter: FabricVoterParticipationAdapter;

  const input = { electionId: 'election-1', electorId: 'elector-1' };

  const statusOf = (status: string) =>
    ({ status }) as unknown as Awaited<ReturnType<VotersService['getVoterStatus']>>;

  beforeEach(() => {
    voters = { getVoterStatus: jest.fn() };
    hasher = { hash: jest.fn().mockResolvedValue('hash-1'), hashBatch: jest.fn() };
    adapter = new FabricVoterParticipationAdapter(voters as unknown as VotersService, hasher);
  });

  it('returns true when the ledger status is VOTED', async () => {
    voters.getVoterStatus.mockResolvedValue(statusOf('VOTED'));
    await expect(adapter.hasConfirmedVote(input)).resolves.toBe(true);
  });

  it.each(['ELIGIBLE', 'ISSUED', 'NOT_FOUND'])('returns false when the status is %s', async (s) => {
    voters.getVoterStatus.mockResolvedValue(statusOf(s));
    await expect(adapter.hasConfirmedVote(input)).resolves.toBe(false);
  });

  it('hashes with the election and the elector and queries Fabric with that hash', async () => {
    voters.getVoterStatus.mockResolvedValue(statusOf('VOTED'));

    await adapter.hasConfirmedVote(input);

    expect(hasher.hash).toHaveBeenCalledWith({ electionId: 'election-1', electorId: 'elector-1' });
    expect(voters.getVoterStatus).toHaveBeenCalledWith({
      electionId: 'election-1',
      voterHash: 'hash-1',
    });
  });

  it('propagates Fabric errors unchanged', async () => {
    const fabricError = new Error('FABRIC_UNAVAILABLE');
    voters.getVoterStatus.mockRejectedValue(fabricError);

    await expect(adapter.hasConfirmedVote(input)).rejects.toBe(fabricError);
  });
});
