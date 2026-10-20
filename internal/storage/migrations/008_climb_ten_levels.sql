-- Climb's levels: from 0..1 (shown as 1..100, the thermostat) to the ten
-- levels 1..10 (owner, 2026-10-20). Every stored Climb round gets the new
-- level its old one stands for: the old number divided by 10, rounded up
-- (freeplay.LevelFromOld: 1-10 -> 1, 44 -> 5, 91-100 -> 10). The column
-- stays a number; Climb rounds now hold whole numbers in it, the other
-- modes 0 as before.
UPDATE sessions SET level = CEIL((ROUND(LEAST(GREATEST(level, 0), 1) * 99) + 1) / 10)
WHERE mode = 'freeplay';
