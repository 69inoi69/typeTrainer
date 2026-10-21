-- Freetype's kinds of round (2026-10-21), each a history of its own
-- (storage.FreetypeMode): only long words ("freetype-1000-long"), real
-- sentences ("freetype-sentences") and your own text ("freetype-custom",
-- one for every text).
ALTER TABLE sessions DROP CONSTRAINT sessions_mode_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_mode_check
    CHECK (mode IN ('learning', 'freeplay', 'freetype-sentences', 'freetype-custom')
           OR mode ~ '^freetype-[0-9]+(-long)?$');
