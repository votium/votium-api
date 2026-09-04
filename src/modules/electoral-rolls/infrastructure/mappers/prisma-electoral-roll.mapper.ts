import { ElectoralRollEntity } from '../../domain/entities/electoral-roll.entity';

export type PrismaElectoralRollRow = {
  id: string;
  election_id: string;
  elector_id: string;
  has_voted: boolean;
  vote_attempts: number;
  last_vote_attempt: Date | null;
  created_at: Date;
};

export class PrismaElectoralRollMapper {
  static toDomain(row: PrismaElectoralRollRow): ElectoralRollEntity {
    return ElectoralRollEntity.restore({
      id: row.id,
      electionId: row.election_id,
      electorId: row.elector_id,
      hasVoted: row.has_voted,
      voteAttempts: row.vote_attempts,
      lastVoteAttempt: row.last_vote_attempt,
      createdAt: row.created_at,
    });
  }
}
