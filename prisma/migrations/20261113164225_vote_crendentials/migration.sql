-- CreateEnum
CREATE TYPE "MakeStatus" AS ENUM ('NONE', 'REPORTED', 'MARKED', 'REJECTED');

-- CreateTable
CREATE TABLE "vote_credentials" (
    "election_id" TEXT NOT NULL,
    "elector_id" TEXT NOT NULL,
    "voter_hash" TEXT NOT NULL,
    "blinded_message_hash" TEXT NOT NULL,
    "blind_signature" TEXT NOT NULL,
    "markStatus" "MakeStatus" NOT NULL DEFAULT 'NONE',

    CONSTRAINT "vote_credentials_pkey" PRIMARY KEY ("election_id","elector_id")
);

-- CreateIndex
CREATE INDEX "vote_credentials_election_id_markStatus_idx" ON "vote_credentials"("election_id", "markStatus");
