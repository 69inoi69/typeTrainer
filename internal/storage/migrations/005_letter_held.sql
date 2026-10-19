-- A letter that reached the mastery goal stays mastered until it is clearly
-- worse (engine.KeyStat.Held, docs/ALGORITHM.md section 6). Letters stored
-- before this column count as not held; they are mastered again as soon as
-- they meet the goal.
ALTER TABLE key_stats ADD COLUMN held BOOLEAN NOT NULL DEFAULT FALSE;
