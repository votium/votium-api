import { Prisma } from '../../../../../generated/prisma/client';
import { CandidacyEntity } from '../../domain/entities/candidacy.entity';

export type PrismaCandidacyRow = {
  id: string;
  candidate_id: string;
  election_id: string;
  position_number: number;
  image_url: string | null;
  created_at: Date;
};

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
}
