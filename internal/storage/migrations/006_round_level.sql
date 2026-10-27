-- Climb's level per round.
ALTER TABLE sessions ADD COLUMN level DOUBLE PRECISION NOT NULL DEFAULT 0;
