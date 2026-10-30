// Package config holds every tunable number.
package config

import (
	"time"

	"typingtrainer/internal/auth"
	"typingtrainer/internal/engine"
	"typingtrainer/internal/freeplay"
	"typingtrainer/internal/sim"
)

type Config struct {
	Addr      string
	Server    Server
	MaxEvents int

	MaxBodyBytes      int
	MaxSmallBodyBytes int
	MaxAuthBodyBytes  int
	MaxRoundChars     int

	MaxImportBytes    int
	MaxImportSessions int

	MaxRoundWords   int
	MaxRoundSeconds int

	ConsistencyMinSeconds int
	StreakAccuracies      []float64
	ConfusionMin          int
	ConfusionShown        int
	Accounts              bool
	BehindProxy           bool
	Auth                  auth.Params
	Engine                engine.Params
	Laps                  engine.LapParams
	Forecast              engine.ForecastParams
	Words                 engine.WordParams
	Freeplay              freeplay.Params
	Sim                   sim.Params
}

type Server struct {
	ReadHeader time.Duration
	Read       time.Duration
	Write      time.Duration
	Idle       time.Duration
	Shutdown   time.Duration
}

func Default() Config {
	return Config{
		Addr: "localhost:3000",
		Server: Server{
			ReadHeader: 10 * time.Second,
			Read:       2 * time.Minute,
			Write:      2 * time.Minute,
			Idle:       2 * time.Minute,
			Shutdown:   20 * time.Second,
		},
		MaxEvents: 5000,

		MaxBodyBytes:      1 << 20,
		MaxSmallBodyBytes: 1024,
		MaxAuthBodyBytes:  4096,
		MaxRoundChars:     1 << 20,

		MaxImportBytes:    64 << 20,
		MaxImportSessions: 50000,

		MaxRoundWords:   500,
		MaxRoundSeconds: 600,

		ConsistencyMinSeconds: 5,
		StreakAccuracies:      []float64{95, 97, 100},
		ConfusionMin:          3,
		Laps:                  engine.LapParams{StepWPM: 5, MaxWPM: 60},
		Forecast:              engine.ForecastParams{Window: 10, MinRounds: 3, MaxRounds: 50},
		ConfusionShown:        6,
		Auth: auth.Params{
			Iterations:    600000,
			LoginDays:     30,
			NameMin:       3,
			NameMax:       20,
			PasswordMin:   8,
			PasswordMax:   128,
			GuestDays:     365,
			Attempts:      10,
			AttemptWindow: 15,
		},
		Engine: engine.Params{
			Alpha:         0.1,
			MaxIntervalMs: 2000,

			TargetWPM:    30,
			SlowMs:       1000,
			MaxErrorRate: 0.25,
			ErrorWeight:  0.6,
			SpeedWeight:  0.4,

			PriorDifficulty: 0.7,
			PriorStrength:   5,

			Temperature: 0.1,

			MasteryMinSamples: 20,
			MasteryErrorRate:  0.05,
			KeepErrorRate:     0.10,
			KeepSlowdown:      0.10,
			UnmasteredBonus:   0.2,
			HomeBoost:         4,

			StartLetters:   6,
			MinWords:       30,
			RepeatPenalty:  0.3,
			MinWordLetters: 2,
			MaxRepeats:     2,
			ExerciseWords:  20,

			PortionWords:  6,
			AheadPortions: 2,
			RecentWords:   24,
			RetryWords:    2,
			RoundPortions: 5,

			RankStart:   200,
			RankStep:    200,
			RankPenalty: 0.5,
		},
		Words: engine.WordParams{
			FloorWords:  10,
			RampLetters: 10000,
		},
		Freeplay: freeplay.Params{
			PortionWords:  6,
			MaxStartWords: 60,
			RecentWords:   20,
			RepeatPenalty: 0.3,

			Levels:       []int{200, 500, 1000, 2000, 3000, 5000, 7500, 10000, 15000, 25000},
			LevelStart:   1,
			PassAccuracy: 96,
			FailAccuracy: 92,
			PassesUp:     3,
			FailsDown:    2,
			History:      50,
			MinLetters:   2,

			WeakRounds:     20,
			WeakMinSamples: 15,
			WeakMissMs:     1000,
			WeakPairs:      3,
			WeakShare:      0.5,
			WeakMinWords:   10,

			FreetypeLists: []int{200, 1000, 5000, 10000, 25000},
			LongMin:       6,
			TextMarks:     ".,?!;:'-",
			SentenceTries: 20,
		},
		Sim: sim.Params{
			ErrMin: 0.03, ErrMax: 0.30,
			TimeMin: 350, TimeMax: 900,
			ErrFloor:  0.01,
			TimeFloor: 200,
			LearnRate: 0.02,
			TimeNoise: 0.25,

			ExpertErrMax:   0.05,
			ExpertTimeMin:  150,
			ExpertTimeMax:  350,
			OpenExercises:  100,
			FirstExercises: 30,

			Runs:         20,
			MaxExercises: 3000,

			BestOf:        20,
			MissPenaltyMs: 5000,
			ScoreWindow:   50,
		},
	}
}
