-- Round id, so a round sent twice is kept once.
ALTER TABLE sessions ADD COLUMN round_id TEXT;
CREATE UNIQUE INDEX sessions_round_id ON sessions (user_id, lang, round_id) WHERE round_id IS NOT NULL;
