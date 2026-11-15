-- CreateTable
CREATE TABLE "password_recovery_codes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elector_password_recovery_codes" (
    "id" TEXT NOT NULL,
    "elector_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "elector_password_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "password_recovery_codes_user_id_idx" ON "password_recovery_codes"("user_id");

-- CreateIndex
CREATE INDEX "elector_password_recovery_codes_elector_id_idx" ON "elector_password_recovery_codes"("elector_id");

-- AddForeignKey
ALTER TABLE "password_recovery_codes" ADD CONSTRAINT "password_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elector_password_recovery_codes" ADD CONSTRAINT "elector_password_recovery_codes_elector_id_fkey" FOREIGN KEY ("elector_id") REFERENCES "electors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
