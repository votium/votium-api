export interface CreateCandidacyInput {
  electionId: string;
  candidateId: string;
  positionNumber: number;
  imageUrl?: string | null;
}

export interface RestoreCandidacyInput {
  id: string;
  electionId: string;
  candidateId: string;
  positionNumber: number;
  imageUrl: string | null;
  createdAt: Date;
}

export class CandidacyEntity {
  private constructor(
    public readonly id: string | null,
    public readonly electionId: string,
    public readonly candidateId: string,
    public readonly positionNumber: number,
    public readonly imageUrl: string | null,
    public readonly createdAt: Date | null,
  ) {}

  static create(input: CreateCandidacyInput): CandidacyEntity {
    return new CandidacyEntity(
      null,
      input.electionId,
      input.candidateId,
      input.positionNumber,
      input.imageUrl ?? null,
      null,
    );
  }

  static restore(input: RestoreCandidacyInput): CandidacyEntity {
    return new CandidacyEntity(
      input.id,
      input.electionId,
      input.candidateId,
      input.positionNumber,
      input.imageUrl,
      input.createdAt,
    );
  }
}
