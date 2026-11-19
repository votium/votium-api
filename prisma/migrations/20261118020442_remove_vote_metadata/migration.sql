/*
  Warnings:

  - You are about to drop the column `ledger_block` on the `elections` table. All the data in the column will be lost.
  - You are about to drop the column `ledger_tx_id` on the `elections` table. All the data in the column will be lost.
  - You are about to drop the `anonymous_commitments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `anonymous_credentials` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `anonymous_election_keys` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `anonymous_votes` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `vote_metadata` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "anonymous_commitments" DROP CONSTRAINT "anonymous_commitments_election_id_fkey";

-- DropForeignKey
ALTER TABLE "anonymous_credentials" DROP CONSTRAINT "anonymous_credentials_election_id_fkey";

-- DropForeignKey
ALTER TABLE "anonymous_credentials" DROP CONSTRAINT "anonymous_credentials_elector_id_fkey";

-- DropForeignKey
ALTER TABLE "anonymous_election_keys" DROP CONSTRAINT "anonymous_election_keys_election_id_fkey";

-- DropForeignKey
ALTER TABLE "anonymous_votes" DROP CONSTRAINT "anonymous_votes_election_id_fkey";

-- DropForeignKey
ALTER TABLE "vote_metadata" DROP CONSTRAINT "vote_metadata_election_id_fkey";

-- AlterTable
ALTER TABLE "elections" DROP COLUMN "ledger_block",
DROP COLUMN "ledger_tx_id";

-- DropTable
DROP TABLE "anonymous_commitments";

-- DropTable
DROP TABLE "anonymous_credentials";

-- DropTable
DROP TABLE "anonymous_election_keys";

-- DropTable
DROP TABLE "anonymous_votes";

-- DropTable
DROP TABLE "vote_metadata";
