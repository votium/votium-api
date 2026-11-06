import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import { ElectionNotWithinScheduleError } from 'src/modules/elections/domain/errors/election-not-within-schedule.error';
import { ElectoralRollNotFoundError } from 'src/modules/elections/domain/errors/electoral-roll-not-found.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import type { ElectoralRollRepository } from 'src/modules/elections/domain/repositories/electoral-roll.repository.interface';
import type { BlindSignaturePort } from '../../domain/crypto/blind-signature.port';
import type { KeyProtectionPort } from '../../domain/crypto/key-protection.port';
import { hexToBytes } from '../../domain/crypto/pem';
import { ElectionNotActiveError } from '../../domain/errors/election-not-active.error';
import type { AnonymousVotingRepository } from '../../domain/repositories/anonymous-voting.repository.interface';
import type { ElectionKeyProvisioner } from '../election-key-provisioner';

export interface IssueBallotCredentialInput {
  electionId: string;
  electorId: string;
  y: string;
  blindedMessageHex: string;
  now?: Date;
}

export class IssueBallotCredentialUseCase {
  constructor(
    private readonly elections: ElectionRepository,
    private readonly electoralRolls: ElectoralRollRepository,
    private readonly repository: AnonymousVotingRepository,
    private readonly signer: BlindSignaturePort,
    private readonly protection: KeyProtectionPort,
    private readonly keys: ElectionKeyProvisioner,
  ) {}

  // Returns the blind signature over the blinded message. The server never receives the ballotId.
  // Duplicate-credential and duplicate-y checks run inside the repository transaction, together with
  // the signature and the insert, so two concurrent requests cannot both succeed.
  async execute(input: IssueBallotCredentialInput): Promise<Uint8Array> {
    const now = input.now ?? new Date();

    const election = await this.elections.findById(input.electionId);
    if (!election) throw new ElectionNotFoundError(input.electionId);
    if (!election.canAcceptVotes()) throw new ElectionNotActiveError(input.electionId);
    if (!election.isWithinSchedule(now)) throw new ElectionNotWithinScheduleError();

    const rolls = await this.electoralRolls.findByElectionAndElectorIds(input.electionId, [
      input.electorId,
    ]);
    if (rolls.length === 0) {
      throw new ElectoralRollNotFoundError(input.electionId, input.electorId);
    }

    await this.keys.ensure(input.electionId);
    const blinded = hexToBytes(input.blindedMessageHex);

    return this.repository.issueCredential(
      { electionId: input.electionId, electorId: input.electorId, y: input.y, now },
      (privateKeyEnc) => this.signer.blindSign(this.protection.decrypt(privateKeyEnc), blinded),
    );
  }
}
