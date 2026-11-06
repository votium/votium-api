-- Add a unique correlative code to every election and the per-period counter used to
-- allocate future codes atomically.
--
-- Format: ELECTION-MMYYYY-XXXX
--   MMYYYY = UTC month/year of creation
--   XXXX   = 0001..9999, reset for each MMYYYY period

-- Reject data that cannot be represented by the four-digit suffix before mutating.
DO $$
DECLARE overflowing_period text;
BEGIN
  SELECT to_char(created_at, 'MMYYYY')
    INTO overflowing_period
  FROM "elections"
  GROUP BY 1
  HAVING COUNT(*) > 9999
  LIMIT 1;

  IF overflowing_period IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot backfill election_code: period % has more than 9999 elections',
      overflowing_period;
  END IF;
END $$;

ALTER TABLE "elections" ADD COLUMN "election_code" VARCHAR(20);

-- Backfill deterministically: within each period, oldest created_at first, id as the
-- tie-breaker. `created_at` is TIMESTAMP(3) storing UTC.
WITH ranked AS (
  SELECT
    id,
    'ELECTION-'
      || to_char(created_at, 'MMYYYY')
      || '-'
      || lpad(
           row_number() OVER (
             PARTITION BY to_char(created_at, 'MMYYYY')
             ORDER BY created_at ASC, id ASC
           )::text,
           4,
           '0'
         ) AS code
  FROM "elections"
)
UPDATE "elections" e
SET "election_code" = r.code
FROM ranked r
WHERE e.id = r.id;

ALTER TABLE "elections" ALTER COLUMN "election_code" SET NOT NULL;

CREATE UNIQUE INDEX "elections_election_code_key"
  ON "elections"("election_code");

CREATE TABLE "election_code_counters" (
  "period" CHAR(6) NOT NULL,
  "last_value" INTEGER NOT NULL,
  CONSTRAINT "election_code_counters_pkey" PRIMARY KEY ("period")
);

-- Seed the counters from the backfilled maximum so the next allocation continues
-- after the existing rows instead of restarting at 0001.
INSERT INTO "election_code_counters" ("period", "last_value")
SELECT
  substring("election_code" from 10 for 6),
  max(substring("election_code" from 17 for 4)::int)
FROM "elections"
GROUP BY 1;
