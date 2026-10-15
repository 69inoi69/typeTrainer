-- The study group of a user study (storage.GroupRandom, docs/ALGORITHM.md
-- section 11): per user and language, and for every learning round, so
-- rounds of the two groups can be told apart. '' = the normal app.
ALTER TABLE progress ADD COLUMN study_group TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN study_group TEXT NOT NULL DEFAULT '';
