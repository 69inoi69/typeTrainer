// Package config keeps every tunable number in ONE place.
// Change values here, not inside the logic. What each number means and why
// it has this value is explained in docs/ALGORITHM.md ("Parameters").
package config

import (
	"typingtrainer/internal/engine"
	"typingtrainer/internal/sim"
)

type Config struct {
	Addr      string // address the HTTP server listens on
	MaxEvents int    // safety limit for one results request

	MaxImportBytes    int // largest accepted import body (one language)
	MaxImportSessions int // most history entries accepted in one import
	Engine            engine.Params
	Sim               sim.Params // only for the simulation tool (go run ./tools/sim)
}

func Default() Config {
	return Config{
		Addr:      "localhost:3000",
		MaxEvents: 5000,

		MaxImportBytes:    8 << 20, // 8 MB: years of history still fit
		MaxImportSessions: 50000,
		Engine: engine.Params{
			Alpha:         0.1,  // EMA: roughly the last ~20 occurrences of a letter matter
			MaxIntervalMs: 2000, // gaps over 2 s are pauses, ignored for speed

			TargetWPM:    30,   // goal speed = 400 ms per character
			SlowMs:       1000, // 1 s per character = as slow as it gets (speed difficulty 1)
			MaxErrorRate: 0.25, // a mistake on every 4th occurrence = as bad as it gets
			ErrorWeight:  0.6,  // accuracy matters a bit more than speed...
			SpeedWeight:  0.4,  // ...(the two weights must add up to 1)

			PriorDifficulty: 0.7, // before we see a letter, assume it is fairly hard
			PriorStrength:   5,   // the assumption is worth 5 real samples

			Temperature: 0.25, // difficulty 1 vs 0 -> about 55x more likely

			MasteryMinSamples: 20,   // at least 20 occurrences...
			MasteryErrorRate:  0.05, // ...under 5% mistakes, and at TargetWPM

			StartLetters:  6,   // first lesson: at least 6 letters
			MinWords:      30,  // ...and at least 30 real words to choose from
			RepeatPenalty: 0.3, // each earlier use in the exercise multiplies weight by 0.3
			ExerciseWords: 20,  // short exercises -> the model updates more often
		},
		// A made-up typist: assumptions of the simulation, not measured values.
		// docs/ALGORITHM.md section 11 explains them.
		Sim: sim.Params{
			ErrMin: 0.03, ErrMax: 0.30, // some letters almost fine, some wrong every 3rd time
			TimeMin: 350, TimeMax: 900, // from just above 30 WPM to hunting for the key
			ErrFloor:  0.01, // nobody gets to exactly 0 mistakes
			TimeFloor: 200,  // 60 WPM: the limit of this typist
			LearnRate: 0.02, // ~100 presses take a bad letter to the mastery goal
			TimeNoise: 0.25, // presses vary by up to ±25 %

			ExpertErrMax:   0.05, // experienced typist: at most 5 % mistakes per letter...
			ExpertTimeMin:  150,  // ...and 150..350 ms per press (about 35..80 WPM)
			ExpertTimeMax:  350,
			OpenExercises:  100, // expert: variety is measured over 100 exercises
			FirstExercises: 30,  // beginner: variety of the first 30 exercises (~20 minutes)

			Runs:         20,   // 20 different typists per strategy
			MaxExercises: 3000, // about 30 hours of practice at 30 WPM: give up

			BestOf:        20,   // monkeytype weak-spot.ts: wordSamples
			MissPenaltyMs: 5000, // monkeytype weak-spot.ts: incorrectPenalty
			ScoreWindow:   50,   // monkeytype weak-spot.ts: perCharCount
		},
	}
}
