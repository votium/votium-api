import { spkiToPem } from '../domain/crypto/pem';
import type { BlindSignaturePort } from '../domain/crypto/blind-signature.port';
import type { KeyProtectionPort } from '../domain/crypto/key-protection.port';
import type {
  AnonymousVotingRepository,
  StoredElectionKey,
} from '../domain/repositories/anonymous-voting.repository.interface';

// Creates the RSA key pair of an election the first time it is needed. Concurrent callers end up
// reading the same stored row, because the repository stores the key only if absent.
export class ElectionKeyProvisioner {
  constructor(
    private readonly repository: AnonymousVotingRepository,
    private readonly signer: BlindSignaturePort,
    private readonly protection: KeyProtectionPort,
  ) {}

  async ensure(electionId: string): Promise<StoredElectionKey> {
    const existing = await this.repository.findElectionKey(electionId);
    if (existing) return existing;

    const pair = await this.signer.generateKeyPair();
    await this.repository.saveElectionKeyIfAbsent(electionId, {
      publicKeyPem: spkiToPem(pair.publicKeySpki),
      privateKeyEnc: this.protection.encrypt(pair.privateKeyPkcs8),
    });

    const stored = await this.repository.findElectionKey(electionId);
    if (!stored) throw new Error(`election key missing after provisioning: ${electionId}`);
    return stored;
  }
}
