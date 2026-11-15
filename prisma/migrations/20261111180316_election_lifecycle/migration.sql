-- AlterTable
ALTER TABLE "elections" ADD COLUMN     "canceled_at" TIMESTAMP(3),
ADD COLUMN     "closed_at" TIMESTAMP(3),
ADD COLUMN     "ledger_block" INTEGER,
ADD COLUMN     "ledger_tx_id" TEXT,
ADD COLUMN     "published_at" TIMESTAMP(3),
ADD COLUMN     "signing_public_key" TEXT,
ADD COLUMN     "started_at" TIMESTAMP(3),
ADD COLUMN     "updated_at" TIMESTAMP(3);
