-- Learn's laps (2026-10-21): after every letter is mastered (Learn
-- complete) the goal speed goes up and the letters are learned again at
-- it. progress.lap is where the typist is; sessions.lap the lap each Learn
-- round was typed in, so a replay of the letter model (history) judges
-- every round by its own goal.
ALTER TABLE progress ADD COLUMN lap INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN lap INTEGER NOT NULL DEFAULT 0;
