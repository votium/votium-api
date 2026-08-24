import { Prisma } from '../../../../../generated/prisma/client';
import { ElectionEntity, type ElectionStatus } from '../../domain/entities/election.entity';

export type PrismaElectionRow = {
  id: string;
  name: string;
  description: string;
  start_date: Date;
  start_time: Date;
  end_date: Date;
  end_time: Date;
  current_status: string;
  blank_vote_enabled: boolean;
  created_at: Date;
};

export class PrismaElectionMapper {
  static toDomain(row: PrismaElectionRow): ElectionEntity {
    return ElectionEntity.restore({
      id: row.id,
      name: row.name,
      description: row.description,
      startDate: row.start_date,
      startTime: row.start_time,
      endDate: row.end_date,
      endTime: row.end_time,
      currentStatus: row.current_status as ElectionStatus,
      blankVoteEnabled: row.blank_vote_enabled,
      createdAt: row.created_at,
    });
  }

  static toPersistence(entity: ElectionEntity): Prisma.ElectionUncheckedCreateInput {
    return {
      name: entity.name,
      description: entity.description,
      start_date: entity.startDate,
      start_time: entity.startTime,
      end_date: entity.endDate,
      end_time: entity.endTime,
      // The domain status is constrained to the ElectionStatus literal union, which is
      // assignable to the Prisma StatusElection enum without a cast.
      current_status: entity.currentStatus,
      blank_vote_enabled: entity.blankVoteEnabled,
    };
  }
}
