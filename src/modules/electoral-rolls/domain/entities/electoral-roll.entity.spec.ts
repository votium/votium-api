import { ElectoralRollEntity } from './electoral-roll.entity';

describe('ElectoralRollEntity', () => {
  const electionId = 'election-uuid';
  const electorId = 'elector-uuid';

  describe('create', () => {
    it('should create a new electoral roll with default values', () => {
      const entity = ElectoralRollEntity.create({ electionId, electorId });

      expect(entity.id).toBeNull();
      expect(entity.electionId).toBe(electionId);
      expect(entity.electorId).toBe(electorId);
      expect(entity.hasVoted).toBe(false);
      expect(entity.voteAttempts).toBe(0);
      expect(entity.lastVoteAttempt).toBeNull();
      expect(entity.lastVoteCandidacyId).toBeNull();
      expect(entity.lastVoteIdempotencyKey).toBeNull();
      expect(entity.lastVoteRegisteredAt).toBeNull();
      expect(entity.createdAt).toBeNull();
    });
  });

  describe('restore', () => {
    it('should restore an electoral roll from persistence', () => {
      const now = new Date();
      const lastVote = new Date('2025-01-15T10:00:00Z');

      const entity = ElectoralRollEntity.restore({
        id: 'roll-uuid',
        electionId,
        electorId,
        hasVoted: true,
        voteAttempts: 2,
        lastVoteAttempt: lastVote,
        lastVoteCandidacyId: 'candidacy-uuid',
        lastVoteIdempotencyKey: 'key-abc',
        lastVoteRegisteredAt: lastVote,
        createdAt: now,
      });

      expect(entity.id).toBe('roll-uuid');
      expect(entity.electionId).toBe(electionId);
      expect(entity.electorId).toBe(electorId);
      expect(entity.hasVoted).toBe(true);
      expect(entity.voteAttempts).toBe(2);
      expect(entity.lastVoteAttempt).toBe(lastVote);
      expect(entity.lastVoteCandidacyId).toBe('candidacy-uuid');
      expect(entity.lastVoteIdempotencyKey).toBe('key-abc');
      expect(entity.lastVoteRegisteredAt).toBe(lastVote);
      expect(entity.createdAt).toBe(now);
    });

    it('should restore with null lastVoteAttempt', () => {
      const entity = ElectoralRollEntity.restore({
        id: 'roll-uuid',
        electionId,
        electorId,
        hasVoted: false,
        voteAttempts: 0,
        lastVoteAttempt: null,
        lastVoteCandidacyId: null,
        lastVoteIdempotencyKey: null,
        lastVoteRegisteredAt: null,
        createdAt: new Date(),
      });

      expect(entity.lastVoteAttempt).toBeNull();
      expect(entity.lastVoteCandidacyId).toBeNull();
      expect(entity.lastVoteIdempotencyKey).toBeNull();
      expect(entity.lastVoteRegisteredAt).toBeNull();
    });
  });
});
