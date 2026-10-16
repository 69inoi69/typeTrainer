-- What each round was typed on (storage.Session.Device): 'keyboard',
-- 'touch', or '' for rounds from before it was kept. Recorded only; the
-- letter model does not use it.
ALTER TABLE sessions ADD COLUMN device TEXT NOT NULL DEFAULT '';
