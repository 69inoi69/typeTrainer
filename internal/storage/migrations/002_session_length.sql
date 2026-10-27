-- Round length per round.

ALTER TABLE sessions ADD COLUMN length TEXT NOT NULL DEFAULT 'words-30';
CREATE INDEX sessions_by_length ON sessions (user_id, lang, mode, length, id);
