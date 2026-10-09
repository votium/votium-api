import { ElectionStatusTransitionError } from '../errors/election-status-transition.error';

export const ELECTION_STATUSES = [
  'PENDING',
  'CREATED',
  'ACTIVE',
  'CLOSED',
  'PUBLISHED',
  'CANCELLED',
] as const;

export type ElectionStatus = (typeof ELECTION_STATUSES)[number];

// The formal election lifecycle, in lifecycle order:
//   PENDING -> CREATED -> ACTIVE -> CLOSED -> PUBLISHED
// plus a terminal CANCELLED sink reachable from every non-terminal state:
//   PENDING/CREATED/ACTIVE/CLOSED -> CANCELLED
// This table is the single authoritative source of the transition graph: the forward
// lifecycle and the cancellation sink are the only allowed moves, and both PUBLISHED and
// CANCELLED map to empty lists so terminality is structural rather than an extra guard.
// `canTransitionTo` and `transitionTo` are both pure functions of it, so they cannot
// drift apart.
export const ELECTION_TRANSITIONS: Readonly<Record<ElectionStatus, readonly ElectionStatus[]>> = {
  PENDING: ['CREATED', 'CANCELLED'],
  CREATED: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['CLOSED', 'CANCELLED'],
  CLOSED: ['PUBLISHED', 'CANCELLED'],
  PUBLISHED: [],
  CANCELLED: [],
};

export interface CreateElectionInput {
  name: string;
  description: string;
  startDate: Date;
  startTime: Date;
  endDate: Date;
  endTime: Date;
  blankVoteEnabled?: boolean;
}

export interface RestoreElectionInput {
  id: string;
  name: string;
  description: string;
  startDate: Date;
  startTime: Date;
  endDate: Date;
  endTime: Date;
  currentStatus: ElectionStatus;
  blankVoteEnabled: boolean;
  createdAt: Date;
}

// Partial input for an election update. Only the provided fields are merged; the rest
// keep their current value. Date/time fields carry already-parsed Date values (the
// string-to-Date parsing and resulting-interval validation live in the application layer).
export interface UpdateElectionInput {
  name?: string;
  description?: string;
  startDate?: Date;
  startTime?: Date;
  endDate?: Date;
  endTime?: Date;
  blankVoteEnabled?: boolean;
}

export class ElectionEntity {
  static readonly DEFAULT_STATUS: ElectionStatus = 'PENDING';
  static readonly DEFAULT_BLANK_VOTE = false;

  private constructor(
    public readonly id: string | null,
    public name: string,
    public description: string,
    public startDate: Date,
    public startTime: Date,
    public endDate: Date,
    public endTime: Date,
    private _currentStatus: ElectionStatus,
    public blankVoteEnabled: boolean,
    public readonly createdAt: Date | null,
  ) {}

  get currentStatus(): ElectionStatus {
    return this._currentStatus;
  }

  // Combines a calendar date (UTC midnight) and a time-of-day (epoch-based) into a
  // comparable instant. Single source of truth for the date+time combination used by
  // the schedule-window rules (assertElectionInterval and isWithinSchedule).
  static toInstant(date: Date, time: Date): number {
    return Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      time.getUTCHours(),
      time.getUTCMinutes(),
      time.getUTCSeconds(),
    );
  }

  // Whether `now` falls inside the configured start/closing window
  // (start_instant <= now <= end_instant). Both boundaries are inclusive, matching
  // the repository's buildActiveFilter semantics and the manual-start rule
  // `startDate <= currentDateTime <= endDate`. Single decision point for the
  // schedule-eligibility rule.
  isWithinSchedule(now: Date): boolean {
    const t = now.getTime();
    return (
      ElectionEntity.toInstant(this.startDate, this.startTime) <= t &&
      t <= ElectionEntity.toInstant(this.endDate, this.endTime)
    );
  }

  // Whether the configured end instant (end_date + end_time) has been reached by
  // `now`. Inclusive boundary (now == endInstant counts as reached), matching
  // isWithinSchedule's upper bound and the repository's `notEnded` filter (its
  // inversion). Single decision point for the automatic-closure eligibility rule.
  hasReachedEnd(now: Date): boolean {
    return ElectionEntity.toInstant(this.endDate, this.endTime) <= now.getTime();
  }

  static create(input: CreateElectionInput): ElectionEntity {
    return new ElectionEntity(
      null,
      input.name.trim(),
      input.description.trim(),
      input.startDate,
      input.startTime,
      input.endDate,
      input.endTime,
      ElectionEntity.DEFAULT_STATUS,
      input.blankVoteEnabled ?? ElectionEntity.DEFAULT_BLANK_VOTE,
      null,
    );
  }

  static restore(input: RestoreElectionInput): ElectionEntity {
    return new ElectionEntity(
      input.id,
      input.name,
      input.description,
      input.startDate,
      input.startTime,
      input.endDate,
      input.endTime,
      input.currentStatus,
      input.blankVoteEnabled,
      input.createdAt,
    );
  }

  // Whether the election can still be edited. Only the initial configuration state
  // (PENDING) is editable; once the election is finalized (CREATED) its configuration
  // is frozen, and ACTIVE/CLOSED/PUBLISHED are sealed. Single decision point for the
  // editable-state rule.
  isEditable(): boolean {
    return this._currentStatus === ElectionEntity.DEFAULT_STATUS;
  }

  // Whether the election can be deleted. Only the initial configuration state (PENDING)
  // is deletable, mirroring isEditable(). Single decision point for the deletable-state
  // rule.
  isDeletable(): boolean {
    return this._currentStatus === ElectionEntity.DEFAULT_STATUS;
  }

  // Whether an electoral roll may still be loaded into this election. Only the
  // initial configuration state (PENDING) accepts a roll; once the election is
  // finalized (CREATED) the roll is sealed. Single decision point for the
  // registerable-state rule.
  isRollLoadable(): boolean {
    return this._currentStatus === ElectionEntity.DEFAULT_STATUS;
  }

  // Whether the electoral roll of this election can be modified. Only the initial
  // configuration state (PENDING) allows roll modifications; CREATED/ACTIVE/CLOSED/
  // PUBLISHED are sealed. Single decision point for the modifiable rule.
  isRollModifiable(): boolean {
    return this._currentStatus === ElectionEntity.DEFAULT_STATUS;
  }

  // Whether the election can still accept candidate registrations. Only the initial
  // configuration state (PENDING) may receive candidacies. Single decision point for
  // the candidacy-eligibility rule.
  canAcceptCandidacy(): boolean {
    return this._currentStatus === ElectionEntity.DEFAULT_STATUS;
  }

  // Whether the election is currently accepting votes. Voting is permitted only
  // while the election is ACTIVE; every other lifecycle state rejects votes. Single
  // decision point for the voting-state rule.
  canAcceptVotes(): boolean {
    return this._currentStatus === 'ACTIVE';
  }

  // Whether the lifecycle permits moving from the current status to `next`, per
  // ELECTION_TRANSITIONS. Pure read: never mutates the entity.
  canTransitionTo(next: ElectionStatus): boolean {
    return ELECTION_TRANSITIONS[this._currentStatus].includes(next);
  }

  // Performs the single authoritative lifecycle transition. Any move that is not in
  // ELECTION_TRANSITIONS — a backward step, a skip, a self-transition, or any move out
  // of PUBLISHED — throws and leaves the entity unchanged.
  transitionTo(next: ElectionStatus): void {
    if (!this.canTransitionTo(next)) {
      throw new ElectionStatusTransitionError(this._currentStatus, next);
    }
    this._currentStatus = next;
  }

  // Merges the provided partial input into the entity. Only supplied fields change;
  // `id`, `currentStatus`, and `createdAt` are immutable and never touched here.
  update(input: UpdateElectionInput): void {
    if (input.name !== undefined) this.name = input.name.trim();
    if (input.description !== undefined) this.description = input.description.trim();
    if (input.startDate !== undefined) this.startDate = input.startDate;
    if (input.startTime !== undefined) this.startTime = input.startTime;
    if (input.endDate !== undefined) this.endDate = input.endDate;
    if (input.endTime !== undefined) this.endTime = input.endTime;
    if (input.blankVoteEnabled !== undefined) this.blankVoteEnabled = input.blankVoteEnabled;
  }
}
