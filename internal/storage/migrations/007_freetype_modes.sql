-- Freetype's rounds and word lists.
ALTER TABLE sessions DROP CONSTRAINT sessions_mode_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_mode_check
    CHECK (mode IN ('learning', 'freeplay') OR mode ~ '^freetype-[0-9]+$');
