import { CandidacyNotFoundError } from 'src/modules/candidacies/domain/errors/candidacy-not-found.error';
import type { CandidacyRepository } from 'src/modules/candidacies/domain/repositories/candidacy.repository.interface';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import { ElectionNotWithinScheduleError } from 'src/modules/elections/domain/errors/election-not-within-schedule.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import { ElectoralRollNotFoundError } from 'src/modules/electoral-rolls/domain/errors/electoral-roll-not-found.error';
import type { ElectoralRollEntity } from 'src/modules/electoral-rolls/domain/entities/electoral-roll.entity';
import type { ElectoralRollRepository } from 'src/modules/electoral-rolls/domain/repositories/electoral-roll.repository.interface';
import { BlankVoteDisabledError } from '../../domain/errors/blank-vote-disabled.error';
import { ElectionNotActiveError } from '../../domain/errors/election-not-active.error';
import { IdempotencyKeyConflictError } from '../../domain/errors/idempotency-key-conflict.error';
import { VoteAlreadyRegisteredError } from '../../domain/errors/vote-already-registered.error';
import type { VoteRepository } from '../../domain/repositories/vote.repository.interface';

// Stable identifier for the blank-vote option, matching the ballot's blankVote.id.
const BLANK_VOTE_OPTION_ID = 'blank';

export interface RegisterVoteInput {
  electionId: string;
  electorId: string;
  candidacyId: string;
  // Optional client-supplied idempotency key. When reused on a retry it lets the
  // server return the already-registered result instead of a duplicate-vote error.
  idempotencyKey?: string;
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
    private readonly votes: VoteRepository,
  ) {}

  async execute(input: RegisterVoteInput): Promise<RegisterVoteResult> {
    const now = input.now ?? new Date();

    const election = await this.elections.findById(input.electionId);
    if (!election) {
      throw new ElectionNotFoundError(input.electionId);
    }

    const roll = await this.findRoll(input.electionId, input.electorId);

    // Retry/idempotency check must run before the election-status check so an
    // already-successful idempotent retry still returns its stored result even if
    // the election has since closed (Rule 19).
    if (roll.hasVoted) {
      return this.resolveAlreadyVoted(roll, input);
    }

    // Uses the entity's single decision point for the voting-state rule instead of
    // re-deriving "ACTIVE" here, so the lifecycle rule lives in one place only.
    if (!election.canAcceptVotes()) {
      throw new ElectionNotActiveError(input.electionId);
    }

    // Schedule validation: a vote may only be registered while the current date/time
    // is inside the election's configured voting interval. Runs after the state check
    // (so a non-ACTIVE election still surfaces as 409) and reuses the entity's single
    // decision point for the schedule-eligibility rule.
    if (!election.isWithinSchedule(now)) {
      throw new ElectionNotWithinScheduleError();
    }

    if (input.candidacyId === BLANK_VOTE_OPTION_ID) {
      if (!election.blankVoteEnabled) {
        throw new BlankVoteDisabledError();
      }
    } else {
      // findByElection already excludes INACTIVE candidates and candidacies from other
      // elections, so a missing, mismatched, or inactive candidacy all surface here.
      const validCandidacies = await this.candidacies.findByElection(input.electionId);
      const selected = validCandidacies.find((candidacy) => candidacy.id === input.candidacyId);
      if (!selected) {
        throw new CandidacyNotFoundError(input.candidacyId);
      }
    }

    const result = await this.votes.recordVote({
      electionId: input.electionId,
      electorId: input.electorId,
      candidacyId: input.candidacyId,
      idempotencyKey: input.idempotencyKey ?? null,
      now,
    });

    if (result.outcome === 'recorded') {
      return {
        electionId: input.electionId,
        candidacyId: input.candidacyId,
        registeredAt: now,
      };
    }

    // Lost a concurrent race: another request claimed the vote first. Re-read the
    // roll and resolve as replay or duplicate using the trusted persisted state.
    const latest = await this.findRoll(input.electionId, input.electorId);
    return this.resolveAlreadyVoted(latest, input);
  }

  private async findRoll(electionId: string, electorId: string): Promise<ElectoralRollEntity> {
    const rolls = await this.electoralRolls.findByElectionAndElectorIds(electionId, [electorId]);
    if (rolls.length === 0) {
      throw new ElectoralRollNotFoundError(electionId, electorId);
    }
    return rolls[0];
  }

  // Resolves an already-voted roll: either replay the stored successful result (when
  // the request provably corresponds to the same logical operation via a matching
  // idempotency key) or reject as a duplicate / key conflict.
  private resolveAlreadyVoted(
    roll: ElectoralRollEntity,
    input: RegisterVoteInput,
  ): RegisterVoteResult {
    if (input.idempotencyKey != null && roll.lastVoteIdempotencyKey === input.idempotencyKey) {
      if (roll.lastVoteCandidacyId !== input.candidacyId) {
        throw new IdempotencyKeyConflictError();
      }
      // Invariant: hasVoted === true implies the replay columns were written atomically.
      return {
        electionId: input.electionId,
        candidacyId: roll.lastVoteCandidacyId,
        registeredAt: roll.lastVoteRegisteredAt as Date,
      };
    }
    throw new VoteAlreadyRegisteredError(input.electionId);
  }
}
