-- DropForeignKey
ALTER TABLE "election_status_history" DROP CONSTRAINT "election_status_history_user_id_fkey";

-- AlterTable
ALTER TABLE "election_status_history" ALTER COLUMN "user_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "election_status_history" ADD CONSTRAINT "election_status_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
