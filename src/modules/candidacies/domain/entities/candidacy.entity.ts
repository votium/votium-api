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

// Partial input for a candidacy update. Only the provided fields are merged;
// the rest keep their current value. `imageUrl: null` clears the photo while
// `undefined` leaves it unchanged. `id`, `electionId`, `candidateId`, and
// `createdAt` are immutable and never part of an update.
export interface UpdateCandidacyInput {
  positionNumber?: number;
  imageUrl?: string | null;
}

export class CandidacyEntity {
  private constructor(
    public readonly id: string | null,
    public readonly electionId: string,
    public readonly candidateId: string,
    public positionNumber: number,
    public imageUrl: string | null,
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

  // Merges the provided partial input into the entity. Only supplied fields
  // change. `imageUrl: null` clears the current photo (explicit null is not
  // `undefined`, which would leave it unchanged). `positionNumber: null` is
  // a no-op because the ballot position is never nullable.
  update(input: UpdateCandidacyInput): void {
    if (input.positionNumber !== undefined && input.positionNumber !== null) {
      this.positionNumber = input.positionNumber;
    }
    if (input.imageUrl !== undefined) this.imageUrl = input.imageUrl;
  }
}
