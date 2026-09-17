-- AlterTable
ALTER TABLE "candidates" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "electors" ADD COLUMN     "deleted_at" TIMESTAMP(3);
