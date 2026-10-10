-- AlterTable
-- `updated_at` is required in the schema; backfill existing rows from `created_at`
-- before enforcing the NOT NULL constraint.
ALTER TABLE "electors" ADD COLUMN     "updated_at" TIMESTAMP(3);

UPDATE "electors" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;

ALTER TABLE "electors" ALTER COLUMN "updated_at" SET NOT NULL;

-- AlterTable
ALTER TABLE "electors" ADD COLUMN     "identification" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "electors_identification_key" ON "electors"("identification");