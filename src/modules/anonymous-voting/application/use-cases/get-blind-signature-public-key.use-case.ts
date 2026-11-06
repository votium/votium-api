import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import { ElectionNotActiveError } from '../../domain/errors/election-not-active.error';
import type { ElectionKeyProvisioner } from '../election-key-provisioner';

export interface BlindSignaturePublicKeyResult {
  publicKeyPem: string;
  algorithm: string;
  keySizeBits: number;
}

export class GetBlindSignaturePublicKeyUseCase {
  constructor(
    private readonly elections: ElectionRepository,
    private readonly keys: ElectionKeyProvisioner,
  ) {}

  // Clients need the key while the election is being prepared (CREATED) and while it is open (ACTIVE).
  async execute(electionId: string): Promise<BlindSignaturePublicKeyResult> {
    const election = await this.elections.findById(electionId);
    if (!election) throw new ElectionNotFoundError(electionId);
    const status = election.currentStatus;
    if (status !== 'CREATED' && status !== 'ACTIVE') {
      throw new ElectionNotActiveError(electionId);
    }
    const key = await this.keys.ensure(electionId);
    return {
      publicKeyPem: key.publicKeyPem,
      algorithm: 'RSABSSA-SHA384-PSS-Deterministic',
      keySizeBits: 2048,
    };
  }
}
