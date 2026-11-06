import { CandidacyNotFoundError } from 'src/modules/candidacies/domain/errors/candidacy-not-found.error';
import type { CandidacyRepository } from 'src/modules/candidacies/domain/repositories/candidacy.repository.interface';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import { ElectionNotWithinScheduleError } from 'src/modules/elections/domain/errors/election-not-within-schedule.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import type { BlindSignaturePort } from '../../domain/crypto/blind-signature.port';
import { buildBallotMessage } from '../../domain/crypto/ballot-message';
import type { ProofVerifierPort } from '../../domain/crypto/proof-verifier.port';
import { hexToBytes, pemToSpki } from '../../domain/crypto/pem';
import type { SchnorrProof } from '../../domain/crypto/schnorr-zkp';
import { BlankVoteDisabledError } from '../../domain/errors/blank-vote-disabled.error';
import { ElectionNotActiveError } from '../../domain/errors/election-not-active.error';
import { InvalidProofError } from '../../domain/errors/invalid-proof.error';
import { InvalidSignatureError } from '../../domain/errors/invalid-signature.error';
import { NotEligibleError } from '../../domain/errors/not-eligible.error';
import type { AnonymousVotingRepository } from '../../domain/repositories/anonymous-voting.repository.interface';

export const BLANK_VOTE_ID = 'blank';

export interface CastAnonymousVoteInput {
  electionId: string;
  ballotId: string;
  candidacyId: string;
  signatureHex: string;
  proof: SchnorrProof;
  now?: Date;
}

export class CastAnonymousVoteUseCase {
  constructor(
    private readonly elections: ElectionRepository,
    private readonly candidacies: CandidacyRepository,
    private readonly repository: AnonymousVotingRepository,
    private readonly signer: BlindSignaturePort,
    private readonly verifier: ProofVerifierPort,
  ) {}

  // Validation order follows the API spec, section 4.4. Every rejection happens before the write,
  // so a rejected attempt leaves no ballot behind. This use case receives no identity at all.
  async execute(input: CastAnonymousVoteInput): Promise<{ receipt: string }> {
    const now = input.now ?? new Date();
    const isBlank = input.candidacyId === BLANK_VOTE_ID;

    const election = await this.elections.findById(input.electionId);
    if (!election) throw new ElectionNotFoundError(input.electionId);
    if (!election.canAcceptVotes()) throw new ElectionNotActiveError(input.electionId);
    if (!election.isWithinSchedule(now)) throw new ElectionNotWithinScheduleError();

    if (isBlank) {
      if (!election.blankVoteEnabled) throw new BlankVoteDisabledError();
    } else {
      const valid = await this.candidacies.findByElection(input.electionId);
      if (!valid.some((candidacy) => candidacy.id === input.candidacyId)) {
        throw new CandidacyNotFoundError(input.candidacyId);
      }
    }

    if (!(await this.repository.hasCommitment(input.electionId, input.proof.y))) {
      throw new NotEligibleError();
    }

    const valid = await this.verifier.verify(input.proof, {
      electionId: input.electionId,
      ballotId: input.ballotId,
      candidacyId: input.candidacyId,
    });
    if (!valid) throw new InvalidProofError();

    const key = await this.repository.findElectionKey(input.electionId);
    if (!key) throw new InvalidSignatureError();
    const signatureValid = await this.signer.verify(
      pemToSpki(key.publicKeyPem),
      buildBallotMessage(input.electionId, input.ballotId),
      hexToBytes(input.signatureHex),
    );
    if (!signatureValid) throw new InvalidSignatureError();

    await this.repository.castVote({
      electionId: input.electionId,
      ballotId: input.ballotId,
      candidacyId: isBlank ? null : input.candidacyId,
      now,
    });

    return { receipt: input.ballotId };
  }
}
