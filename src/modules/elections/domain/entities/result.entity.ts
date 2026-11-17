import { ElectionStatusType } from '../value-objects/election-status.vo';

export interface CreateResultInput {
  total: number;
  electionStatus?: ElectionStatusType[4];
  electionId: string;
  registeredVoters?: number;
  candidacies: Array<{
    candidateId: string;
    name: string;
    votes: number;
  }>;
}

export interface RestoreResultInput {
  total: number;
  electionStatus: ElectionStatusType[4];
  electionId: string;
  registeredVoters?: number;
  candidacies: Array<{
    candidateId: string;
    name: string;
    votes: number;
  }>;
}

export class ResultEntity {
  constructor(
    public readonly total: number,
    public readonly electionStatus: ElectionStatusType[4],
    public readonly electionId: string,
    public readonly candidacies: Array<{
      candidateId: string;
      name: string;
      votes: number;
    }>,
    public readonly registeredVoters: number = 0,
  ) {}

  static create(input: CreateResultInput): ResultEntity {
    return new ResultEntity(
      input.total,
      input.electionStatus ?? 'PUBLISHED',
      input.electionId,
      input.candidacies,
      input.registeredVoters ?? 0,
    );
  }

  static restore(input: RestoreResultInput): ResultEntity {
    return new ResultEntity(
      input.total,
      input.electionStatus,
      input.electionId,
      input.candidacies,
      input.registeredVoters ?? 0,
    );
  }

  withRegisteredVoters(registeredVoters: number): ResultEntity {
    return new ResultEntity(
      this.total,
      this.electionStatus,
      this.electionId,
      this.candidacies,
      registeredVoters,
    );
  }

  toJSON(): RestoreResultInput {
    return {
      total: this.total,
      electionStatus: this.electionStatus,
      electionId: this.electionId,
      registeredVoters: this.registeredVoters,
      candidacies: this.candidacies.map((c) => ({
        candidateId: c.candidateId,
        name: c.name,
        votes: c.votes,
      })),
    };
  }

  getCandidacy(
    candidateId: string,
  ): { candidateId: string; name: string; votes: number } | undefined {
    return this.candidacies.find((c) => c.candidateId === candidateId);
  }
}
