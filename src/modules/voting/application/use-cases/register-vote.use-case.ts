import { CandidacyNotFoundError } from 'src/modules/candidacies/domain/errors/candidacy-not-found.error';
import type { CandidacyRepository } from 'src/modules/candidacies/domain/repositories/candidacy.repository.interface';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import { ElectoralRollNotFoundError } from 'src/modules/electoral-rolls/domain/errors/electoral-roll-not-found.error';
import type { ElectoralRollRepository } from 'src/modules/electoral-rolls/domain/repositories/electoral-roll.repository.interface';
import { BlankVoteDisabledError } from '../../domain/errors/blank-vote-disabled.error';
import { ElectionNotActiveError } from '../../domain/errors/election-not-active.error';
import type { ResultRepository } from '../../domain/repositories/result.repository.interface';

// Stable identifier for the blank-vote option, matching the ballot's blankVote.id.
const BLANK_VOTE_OPTION_ID = 'blank';

export interface RegisterVoteInput {
  electionId: string;
  electorId: string;
  candidacyId: string;
  // Reference instant for the registration timestamp. Defaults to the current time.
  now?: Date;
}

export interface RegisterVoteResult {
  electionId: string;
  candidacyId: string;
  registeredAt: Date;
}

export class RegisterVoteUseCase {
  constructor(
    private readonly elections: ElectionRepository,
    private readonly electoralRolls: ElectoralRollRepository,
    private readonly candidacies: CandidacyRepository,
    private readonly results: ResultRepository,
  ) {}

  async execute(input: RegisterVoteInput): Promise<RegisterVoteResult> {
    const now = input.now ?? new Date();

    const election = await this.elections.findById(input.electionId);
    if (!election) {
      throw new ElectionNotFoundError(input.electionId);
    }

    if (election.currentStatus !== 'ACTIVE') {
      throw new ElectionNotActiveError(input.electionId);
    }

    const rolls = await this.electoralRolls.findByElectionAndElectorIds(input.electionId, [
      input.electorId,
    ]);
    if (rolls.length === 0) {
      throw new ElectoralRollNotFoundError(input.electionId, input.electorId);
    }

    if (input.candidacyId === BLANK_VOTE_OPTION_ID) {
      if (!election.blankVoteEnabled) {
        throw new BlankVoteDisabledError();
      }
      return {
        electionId: input.electionId,
        candidacyId: input.candidacyId,
        registeredAt: now,
      };
    }

    // findByElection already excludes INACTIVE candidates and candidacies from other
    // elections, so a missing, mismatched, or inactive candidacy all surface here.
    const validCandidacies = await this.candidacies.findByElection(input.electionId);
    const selected = validCandidacies.find((candidacy) => candidacy.id === input.candidacyId);
    if (!selected) {
      throw new CandidacyNotFoundError(input.candidacyId);
    }

    await this.results.incrementVotes(input.electionId, input.candidacyId);

    return {
      electionId: input.electionId,
      candidacyId: input.candidacyId,
      registeredAt: now,
    };
  }
}
