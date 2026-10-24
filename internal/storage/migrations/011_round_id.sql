-- The id the page gives each round (issue #149): a round sent again after
-- a lost answer is kept once. NULL for older rounds and imports; the index
-- covers only rounds with an id, in every mode of a user's language.
ALTER TABLE sessions ADD COLUMN round_id TEXT;
CREATE UNIQUE INDEX sessions_round_id ON sessions (user_id, lang, round_id) WHERE round_id IS NOT NULL;
