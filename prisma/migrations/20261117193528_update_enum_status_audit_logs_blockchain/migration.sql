/*
  Warnings:

  - The values [PARTAL_SUCCESS] on the enum `AuditLogsBlockchainStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "AuditLogsBlockchainStatus_new" AS ENUM ('SUCCESS', 'PARTIAL_SUCCESS', 'FAILED', 'PENDING', 'COMPENSATED');
ALTER TABLE "public"."audit_logs_blockchain" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "audit_logs_blockchain" ALTER COLUMN "status" TYPE "AuditLogsBlockchainStatus_new" USING ("status"::text::"AuditLogsBlockchainStatus_new");
ALTER TYPE "AuditLogsBlockchainStatus" RENAME TO "AuditLogsBlockchainStatus_old";
ALTER TYPE "AuditLogsBlockchainStatus_new" RENAME TO "AuditLogsBlockchainStatus";
DROP TYPE "public"."AuditLogsBlockchainStatus_old";
ALTER TABLE "audit_logs_blockchain" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;
