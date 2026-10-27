-- The device each round was typed on.
ALTER TABLE sessions ADD COLUMN device TEXT NOT NULL DEFAULT '';
