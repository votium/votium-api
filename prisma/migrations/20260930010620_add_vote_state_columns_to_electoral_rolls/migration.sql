-- AlterTable
ALTER TABLE "electoral_rolls" ADD COLUMN     "last_vote_candidacy_id" TEXT,
ADD COLUMN     "last_vote_idempotency_key" TEXT,
ADD COLUMN     "last_vote_registered_at" TIMESTAMP(3);
