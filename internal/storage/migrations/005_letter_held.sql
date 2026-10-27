-- Mastered letters stay mastered.
ALTER TABLE key_stats ADD COLUMN held BOOLEAN NOT NULL DEFAULT FALSE;
