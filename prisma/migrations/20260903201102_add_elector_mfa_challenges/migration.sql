-- CreateTable
CREATE TABLE "elector_mfa_challenges" (
    "id" TEXT NOT NULL,
    "elector_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "otp_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "resend_at" TIMESTAMP(3),
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "elector_mfa_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "elector_mfa_challenges_session_id_key" ON "elector_mfa_challenges"("session_id");

-- CreateIndex
CREATE INDEX "elector_mfa_challenges_elector_id_idx" ON "elector_mfa_challenges"("elector_id");

-- AddForeignKey
ALTER TABLE "elector_mfa_challenges" ADD CONSTRAINT "elector_mfa_challenges_elector_id_fkey" FOREIGN KEY ("elector_id") REFERENCES "electors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
