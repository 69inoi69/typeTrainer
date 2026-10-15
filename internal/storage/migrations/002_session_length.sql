-- Round lengths (settings): every round remembers the length the user chose,
-- "words-30" or "time-60", so rounds of different lengths are never mixed
-- in one chart or record. Every round stored before this had 30 words.

ALTER TABLE sessions ADD COLUMN length TEXT NOT NULL DEFAULT 'words-30';
CREATE INDEX sessions_by_length ON sessions (user_id, lang, mode, length, id);
