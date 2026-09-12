import { Prisma } from '../../../../../generated/prisma/client';
import { CandidacyEntity, type UpdateCandidacyInput } from '../../domain/entities/candidacy.entity';

export type PrismaCandidacyRow = {
  id: string;
  candidate_id: string;
  election_id: string;
  position_number: number;
  image_url: string | null;
  created_at: Date;
};

// Update payload restricted to the editable columns of the Candiday table.
export type PrismaCandidacyUpdateData = Partial<
  Pick<PrismaCandidacyRow, 'position_number' | 'image_url'>
>;

export class PrismaCandidacyMapper {
  static toDomain(row: PrismaCandidacyRow): CandidacyEntity {
    return CandidacyEntity.restore({
      id: row.id,
      electionId: row.election_id,
      candidateId: row.candidate_id,
      positionNumber: row.position_number,
      imageUrl: row.image_url,
      createdAt: row.created_at,
    });
  }

  static toPersistence(entity: CandidacyEntity): Prisma.CandidayUncheckedCreateInput {
    return {
      candidate_id: entity.candidateId,
      election_id: entity.electionId,
      position_number: entity.positionNumber,
      image_url: entity.imageUrl,
    };
  }

  static toUpdateData(input: UpdateCandidacyInput): PrismaCandidacyUpdateData {
    const data: PrismaCandidacyUpdateData = {};
    // `positionNumber: null` is a no-op (the column is non-nullable).
    if (input.positionNumber !== undefined && input.positionNumber !== null) {
      data.position_number = input.positionNumber;
    }
    // Explicit null is preserved so Prisma clears the stored image.
    if (input.imageUrl !== undefined) data.image_url = input.imageUrl;
    return data;
  }
}
