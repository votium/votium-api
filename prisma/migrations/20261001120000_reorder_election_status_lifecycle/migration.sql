-- Reorder the election lifecycle to the formal flow:
--   PENDING -> CREATED -> ACTIVE -> CLOSED -> PUBLISHED
--
-- The persisted values of PENDING and CREATED previously carried the OPPOSITE
-- meaning (CREATED was the initial/editable state, PENDING was the state reached
-- after loading the electoral roll). This migration swaps their meaning so that
-- PENDING becomes the initial configuration state.
--
-- Mapping (lossless, only the two swapped names change meaning):
--   old CREATED -> PENDING   (initial / editable      -> initial / editable)
--   old PENDING -> CREATED   (roll loaded / finalized -> finalized)
--   ACTIVE, CLOSED, PUBLISHED pass through unchanged.
--
-- Applied to the three StatusElection columns. Uses the type-copy approach (fully
-- transactional) rather than ALTER TYPE ADD VALUE, because a value added in a
-- transaction cannot be used in that same transaction.
CREATE TYPE "StatusElection_new" AS ENUM ('PENDING', 'CREATED', 'ACTIVE', 'CLOSED', 'PUBLISHED');

-- elections.current_status
ALTER TABLE "elections" ALTER COLUMN "current_status" DROP DEFAULT;
ALTER TABLE "elections" ALTER COLUMN "current_status" TYPE "StatusElection_new"
  USING (
    CASE "current_status"::text
      WHEN 'CREATED' THEN 'PENDING'
      WHEN 'PENDING' THEN 'CREATED'
      ELSE "current_status"::text
    END
  )::"StatusElection_new";
ALTER TABLE "elections" ALTER COLUMN "current_status" SET DEFAULT 'PENDING';

-- election_status_history.old_status / .new_status: same mapping, so the recorded
-- history stays consistent with the elections it describes.
ALTER TABLE "election_status_history" ALTER COLUMN "old_status" TYPE "StatusElection_new"
  USING (
    CASE "old_status"::text
      WHEN 'CREATED' THEN 'PENDING'
      WHEN 'PENDING' THEN 'CREATED'
      ELSE "old_status"::text
    END
  )::"StatusElection_new";
ALTER TABLE "election_status_history" ALTER COLUMN "new_status" TYPE "StatusElection_new"
  USING (
    CASE "new_status"::text
      WHEN 'CREATED' THEN 'PENDING'
      WHEN 'PENDING' THEN 'CREATED'
      ELSE "new_status"::text
    END
  )::"StatusElection_new";

DROP TYPE "StatusElection";
ALTER TYPE "StatusElection_new" RENAME TO "StatusElection";
