-- Climb's ten levels.
UPDATE sessions SET level = CEIL((ROUND(LEAST(GREATEST(level, 0), 1) * 99) + 1) / 10)
WHERE mode = 'freeplay';
