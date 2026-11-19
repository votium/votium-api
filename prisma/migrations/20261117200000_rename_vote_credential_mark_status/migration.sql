-- Rename the column in place to preserve existing mark status values.
ALTER TABLE "vote_credentials" RENAME COLUMN "markStatus" TO "mark_status";

-- PostgreSQL keeps the old index name when the column is renamed.
ALTER INDEX "vote_credentials_election_id_markStatus_idx" RENAME TO "vote_credentials_election_id_mark_status_idx";
