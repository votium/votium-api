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

export class ElectionEntity {
  static readonly DEFAULT_STATUS = 'CREATED';
  static readonly DEFAULT_BLANK_VOTE = false;

  private constructor(
    public readonly id: string | null,
    public readonly name: string,
    public readonly description: string,
    public readonly startDate: Date,
    public readonly startTime: Date,
    public readonly endDate: Date,
    public readonly endTime: Date,
    public readonly currentStatus: ElectionStatus,
    public readonly blankVoteEnabled: boolean,
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
}
