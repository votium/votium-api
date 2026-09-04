export interface CreateElectoralRollInput {
  electionId: string;
  electorId: string;
}

export interface RestoreElectoralRollInput {
  id: string;
  electionId: string;
  electorId: string;
  hasVoted: boolean;
  voteAttempts: number;
  lastVoteAttempt: Date | null;
  createdAt: Date;
}

export class ElectoralRollEntity {
  private constructor(
    public readonly id: string | null,
    public readonly electionId: string,
    public readonly electorId: string,
    private _hasVoted: boolean,
    private _voteAttempts: number,
    private _lastVoteAttempt: Date | null,
    public readonly createdAt: Date | null,
  ) {}

  static create(input: CreateElectoralRollInput): ElectoralRollEntity {
    return new ElectoralRollEntity(null, input.electionId, input.electorId, false, 0, null, null);
  }

  static restore(input: RestoreElectoralRollInput): ElectoralRollEntity {
    return new ElectoralRollEntity(
      input.id,
      input.electionId,
      input.electorId,
      input.hasVoted,
      input.voteAttempts,
      input.lastVoteAttempt,
      input.createdAt,
    );
  }

  get hasVoted(): boolean {
    return this._hasVoted;
  }

  get voteAttempts(): number {
    return this._voteAttempts;
  }

  get lastVoteAttempt(): Date | null {
    return this._lastVoteAttempt;
  }
}
