-- Study group per user and per round.
ALTER TABLE progress ADD COLUMN study_group TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN study_group TEXT NOT NULL DEFAULT '';
