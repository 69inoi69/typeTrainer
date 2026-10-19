-- Climb, the second mode: where its difficulty stood at the end of each
-- round (storage.Session.Level, 0..1); the next round goes on from it.
-- 0 for learning rounds and for older history. The typing test that used
-- to open free practice is gone; its column progress.test_passed stays
-- (old migrations are never changed) but nothing reads it any more.
ALTER TABLE sessions ADD COLUMN level DOUBLE PRECISION NOT NULL DEFAULT 0;
