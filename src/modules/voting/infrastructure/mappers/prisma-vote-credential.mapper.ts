import { Prisma } from '../../../../../generated/prisma/client';
import { VoteCredentialEntity } from '../../domain/entities/vote-credential.entity';
import { VoteCredentialStatusType } from '../../domain/values-objects/vote-credential-status.vo';

export type PrismaVoteCredentialRow = {
  election_id: string;
  elector_id: string;
  voter_hash: string;
  blinded_message_hash: string;
  blind_signature: string;
  markStatus: string;
};

export class PrismaVoteCredentialMapper {
  static toDomain(row: PrismaVoteCredentialRow): VoteCredentialEntity {
    return VoteCredentialEntity.restore({
      electionId: row.election_id,
      electorId: row.elector_id,
      voterHash: row.voter_hash,
      blindedMessageHash: row.blinded_message_hash,
      blindSignature: row.blind_signature,
      status: row.markStatus as VoteCredentialStatusType,
    });
  }

  static toPersistence(entity: VoteCredentialEntity): Prisma.VoteCredentialUncheckedCreateInput {
    return {
      election_id: entity.electionId,
      elector_id: entity.electorId,
      voter_hash: entity.voterHash,
      blinded_message_hash: entity.blindedMessageHash,
      blind_signature: entity.blindSignature,
      markStatus: entity.status,
    };
  }
}
