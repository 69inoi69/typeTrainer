// Package config keeps every tunable number in ONE place.
// Change values here, not inside the logic. What each number means and why
// it has this value is explained in docs/ALGORITHM.md ("Parameters").
package config

import (
	"typingtrainer/internal/auth"
	"typingtrainer/internal/engine"
	"typingtrainer/internal/freeplay"
	"typingtrainer/internal/sim"
)

type Config struct {
	Addr      string // address the HTTP server listens on
	MaxEvents int    // safety limit for one results request

	MaxImportBytes    int // largest accepted import body (one language)
	MaxImportSessions int // most history entries accepted in one import

	ConsistencyMinSeconds int // a round shorter than this gets no consistency (engine.Consistency)
	// Accounts: whether /api/v1/auth/* works. Set by setup.go, not here:
	// on GitHub Pages (WebAssembly) there are no cookies, so it is off.
	Accounts bool
	// BehindProxy: the server runs behind a reverse proxy (nginx, Caddy)
	// that ends HTTPS. Then the client's address and "was it HTTPS" come
	// from the proxy's X-Forwarded-For / X-Forwarded-Proto headers. Set by
	// setup.go from the environment variable BEHIND_PROXY=1; never turn it
	// on without a proxy, or anyone could fake those headers.
	BehindProxy bool
	Auth        auth.Params // accounts: passwords, login cookies, name rules
	Engine      engine.Params
	Freeplay    freeplay.Params // free practice and the typing test that opens it
	Sim         sim.Params      // only for the simulation tool (go run ./tools/sim)
}

func Default() Config {
	return Config{
		Addr:      "localhost:3000",
		MaxEvents: 5000,

		MaxImportBytes:    64 << 20, // 64 MB: a round with its raw keys is 5-7 KB, so ~10 000 rounds fit
		MaxImportSessions: 50000,

		ConsistencyMinSeconds: 5, // under 5 full seconds there is too little to judge the pace
		Auth: auth.Params{
			// PBKDF2-SHA256 rounds per password check: the OWASP recommendation
			// (2023). About 0.3 s on a laptop: nothing for one login, very slow
			// for someone trying millions of passwords from a stolen database.
			Iterations:  600000,
			LoginDays:   30,  // a login cookie lasts 30 days, then log in again
			NameMin:     3,   // account names: 3..20 characters...
			NameMax:     20,  // ...of a-z, 0-9, "_" and "-"
			PasswordMin: 8,   // NIST SP 800-63B: at least 8 characters...
			PasswordMax: 128, // ...and an upper limit, so nobody sends megabytes to hash
			// A guest keeps their progress for a year without visiting, like
			// any site that remembers you without an account.
			GuestDays: 365,
			// 10 failed logins (or sign-ups) per IP address in 15 minutes:
			// plenty for a person who forgot a password, about 1000 guesses a
			// day for a script instead of millions (OWASP: limit attempts).
			Attempts:      10,
			AttemptWindow: 15,
		},
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

			Temperature: 0.1, // difficulty 1 vs 0 -> e^10, about 22000x more likely (chosen by the simulation)

			MasteryMinSamples: 20,   // at least 20 occurrences...
			MasteryErrorRate:  0.05, // ...under 5% mistakes, and at TargetWPM

			StartLetters:  6,   // first lesson: at least 6 letters
			MinWords:      30,  // ...and at least 30 real words to choose from
			RepeatPenalty: 0.3, // each earlier use in the exercise multiplies weight by 0.3
			ExerciseWords: 20,  // short exercises -> the model updates more often

			PortionWords:  6,  // a portion is about one line: short enough to react fast
			AheadPortions: 2,  // two portions (~12 words) are always ready on screen
			RecentWords:   20, // "do not repeat" looks at the last 20 words, as one exercise did
			RetryWords:    2,  // up to 2 words with a mistake are typed again
			RoundPortions: 5,  // a round is 30 words: a clear end, then the result

			RankStart:   200, // first lesson: the 200 most common words come freely (monkeytype "200")
			RankStep:    200, // every 200 places further down the list...
			RankPenalty: 0.5, // ...halve the chance of a word
		},
		Freeplay: freeplay.Params{
			PortionWords:  6,   // the same stream as in learning: one line per portion...
			AheadPortions: 2,   // ...two waiting...
			RoundPortions: 5,   // ...and rounds of 30 words (the test is one such round)
			RecentWords:   20,  // "do not repeat" looks at the last 20 words
			RepeatPenalty: 0.3, // a word used recently is rarer, as in learning

			TestWPM:      30, // the typing test: the goal speed of learning (TargetWPM)...
			TestAccuracy: 97, // ...with at most about 1 mistake in 33 key presses
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
