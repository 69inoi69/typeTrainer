-- Freetype, the third mode: its rounds go into the sessions table like
-- Climb's, one history per word list (storage.FreetypeMode: mode
-- "freetype-1000" for the 1000 most common words). The mode check of
-- 001_init.sql allowed only 'learning' and 'freeplay' (Climb); PostgreSQL
-- named that inline check sessions_mode_check.
ALTER TABLE sessions DROP CONSTRAINT sessions_mode_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_mode_check
    CHECK (mode IN ('learning', 'freeplay') OR mode ~ '^freetype-[0-9]+$');
