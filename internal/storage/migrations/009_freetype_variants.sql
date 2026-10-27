-- Freetype's kinds of text.
ALTER TABLE sessions DROP CONSTRAINT sessions_mode_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_mode_check
    CHECK (mode IN ('learning', 'freeplay', 'freetype-sentences', 'freetype-custom')
           OR mode ~ '^freetype-[0-9]+(-long)?$');
