-- CreateEnum
CREATE TYPE "AuditLogsBlockchainStatus" AS ENUM ('SUCCESS', 'PARTAL_SUCCESS', 'FAILED', 'PENDING', 'COMPENSATED');

-- CreateTable
CREATE TABLE "audit_logs_blockchain" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" VARCHAR(36) NOT NULL,
    "action_type" VARCHAR(50) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" VARCHAR(36) NOT NULL,
    "status" "AuditLogsBlockchainStatus" NOT NULL DEFAULT 'PENDING',
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_blockchain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_blockchain_actor_id_idx" ON "audit_logs_blockchain"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_blockchain_entity_id_entity_type_idx" ON "audit_logs_blockchain"("entity_id", "entity_type");

-- CreateIndex
CREATE INDEX "audit_logs_blockchain_action_type_idx" ON "audit_logs_blockchain"("action_type");
