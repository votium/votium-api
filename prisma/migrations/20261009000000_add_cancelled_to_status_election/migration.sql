-- Add the CANCELLED terminal state to the election lifecycle.
-- This is a purely additive change: no existing value changes meaning, no data is
-- rewritten, and the create default (PENDING) is unaffected.
ALTER TYPE "StatusElection" ADD VALUE 'CANCELLED';
