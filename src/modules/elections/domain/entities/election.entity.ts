export type ElectionStatus = 'CREATED' | 'PENDING' | 'PUBLISHED' | 'CLOSED' | 'ACTIVE';

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
  static readonly DEFAULT_STATUS = 'CREATED';
  static readonly DEFAULT_BLANK_VOTE = false;

  private constructor(
    public readonly id: string | null,
    public name: string,
    public description: string,
    public startDate: Date,
    public startTime: Date,
    public endDate: Date,
    public endTime: Date,
    public readonly currentStatus: ElectionStatus,
    public blankVoteEnabled: boolean,
    public readonly createdAt: Date | null,
  ) {}

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

  // Whether the election can still be edited. Only the initial/pending lifecycle state
  // (CREATED) is editable. This is the single decision point for the editable-state rule.
  isEditable(): boolean {
    return this.currentStatus === ElectionEntity.DEFAULT_STATUS;
  }

  // Whether the election can be deleted. Only the initial lifecycle state (CREATED) is
  // deletable, mirroring isEditable(). This is the single decision point for the
  // deletable-state rule.
  isDeletable(): boolean {
    return this.currentStatus === ElectionEntity.DEFAULT_STATUS;
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
