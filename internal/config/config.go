// Package config keeps every tunable number in ONE place.
// Change values here, not inside the logic. What each number means and why
// it has this value is explained in docs/ALGORITHM.md ("Parameters").
//
// setup.go reads Default() once at start and hands each part its own
// numbers (engine.Params to the generator, auth.Params to the accounts, and
// so on); tools/sim and the sim tests read it too. The packages that own the
// numbers define their Params types, so this package imports them, never
// the other way round.
//
// To add a tunable number: a field in the Params type of the package that
// uses it (or in Config for the server itself), its value with a unit and a
// reason in Default below, and a row in docs/ALGORITHM.md section 8 if it
// changes the algorithm. The engine tests write their own copy of the
// engine numbers (testParams in internal/engine/model_test.go): add it there
// too.
package config

import (
	"typingtrainer/internal/auth"
	"typingtrainer/internal/engine"
	"typingtrainer/internal/freeplay"
	"typingtrainer/internal/sim"
)

// Config is every setting of the program, grouped by the part that uses it.
type Config struct {
	Addr      string // address the HTTP server listens on
	MaxEvents int    // safety limit for one results request

	MaxImportBytes    int // largest accepted import body (one language)
	MaxImportSessions int // most history entries accepted in one import

	// Round lengths ("words-30", "time-60", storage.Session.Length): the
	// settings offer a few of them; these limits only stop nonsense.
	MaxRoundWords   int
	MaxRoundSeconds int

	ConsistencyMinSeconds int // a round shorter than this gets no consistency (engine.Consistency)
	// The accuracy streaks of the stats screen (history.AccuracyStreaks):
	// the most rounds in a row at or above each of these accuracies, %.
	StreakAccuracies []float64
	// The mixed-up keys of the Learn stats (history.Confusions): a pair is
	// shown once it happened ConfusionMin times, at most ConfusionShown pairs.
	ConfusionMin   int
	ConfusionShown int
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
	Laps        engine.LapParams      // Learn's laps after Learn complete: a higher goal speed each
	Forecast    engine.ForecastParams // the Learn panel's "about N rounds to the next letter"
	Words       engine.WordParams     // how far down the frequency list learning words may come from
	Freeplay    freeplay.Params       // Climb (its words and its level) and Freetype (its word lists)
	Sim         sim.Params            // only for the simulation tool (go run ./tools/sim)
}

// Default returns the values the program runs with. Tests that must not
// change when a value here changes write their own numbers instead.
func Default() Config {
	return Config{
		Addr:      "localhost:3000",
		MaxEvents: 5000,

		MaxImportBytes:    64 << 20, // 64 MB: a round with its raw keys is 5-7 KB, so ~10 000 rounds fit
		MaxImportSessions: 50000,

		MaxRoundWords:   500, // the settings offer 10 to 50 words (older rounds have 60)
		MaxRoundSeconds: 600, // ...and 15 to 90 seconds

		ConsistencyMinSeconds: 5, // under 5 full seconds there is too little to judge the pace
		// keybr's three: 95 % is good typing, 97 % careful, 100 % no mistake at all
		StreakAccuracies: []float64{95, 97, 100},
		ConfusionMin:     3, // once or twice is a slip; three times is a habit worth a look
		// After Learn complete the goal speed goes up 5 wpm a lap, as
		// keybr's: 30 -> 35 -> ... -> 60 (6 more laps). Past 60 the work
		// is no longer about single letters: Climb is for that.
		Laps: engine.LapParams{StepWPM: 5, MaxWPM: 60},
		// The forecast: a letter's last 10 rounds (its EMAs follow about
		// the last 20 presses, so 10 rounds of a few presses each are its
		// recent trend), from 3 rounds on; beyond 50 rounds it only says
		// "more than 50". Chosen with the simulation (tools/sim,
		// docs/ALGORITHM.md section 10): off by 1.2 rounds on average, and with
		// an answer more often than 6 rounds or a minimum of 5.
		Forecast:       engine.ForecastParams{Window: 10, MinRounds: 3, MaxRounds: 50},
		ConfusionShown: 6, // a short list to act on, not a table
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
			// once mastered, a letter stays mastered up to 10% mistakes and
			// 10% slower than the goal (440 ms, ~27 WPM): one slip no longer
			// takes it back, and every letter need not be clean at once
			KeepErrorRate: 0.10,
			KeepSlowdown:  0.10,
			// a letter not mastered yet: +0.2 difficulty for the focus, that
			// is e^2 ~ 7x the weight of an equal mastered letter at T = 0.1
			// (a letter slightly too slow got about 13% of the focus, like any
			// other, and could block every new letter: the audit, section 3.3)
			UnmasteredBonus: 0.2,
			HomeBoost:       4, // the resting keys count 4x as frequent: the first English lesson is a s l d e f r

			StartLetters:  6,   // first lesson: at least 6 letters
			MinWords:      30,  // ...and at least 30 real words to choose from
			RepeatPenalty: 0.3, // each earlier use in the exercise multiplies weight by 0.3
			// "a" and "i" are the most common words but nothing to practise:
			// they only fill the round
			MinWordLetters: 2,
			// a word at most twice in a round of 30: the penalty alone let a
			// rare letter's 10 words come back 5-6 times
			MaxRepeats:    2,
			ExerciseWords: 20, // short exercises -> the model updates more often

			PortionWords:  6,  // a portion is about one line: short enough to react fast
			AheadPortions: 2,  // two portions (~12 words) are always ready on screen
			RecentWords:   24, // "do not repeat" looks at the last 24 words: with the portion being built, a whole round of 30
			RetryWords:    2,  // up to 2 words with a mistake are typed again
			RoundPortions: 5,  // a round is 30 words: a clear end, then the result

			RankStart:   200, // first lesson: the 200 most common words come freely (monkeytype "200")
			RankStep:    200, // every 200 places further down the list...
			RankPenalty: 0.5, // ...halve the chance of a word
		},
		// MaxRank stays at RankStart (200) until every letter is open, then
		// grows to the whole list (docs/ALGORITHM.md section 7).
		Words: engine.WordParams{
			// One portion has 6 words and "do not repeat" looks at the last
			// 24: 10 words of the focus letter fill a portion without a repeat
			// and leave room for the next one. Only letters with few common
			// words are affected (Russian "ф" has none in the top 200).
			FloorWords: 10,
			// 10 000 letters after the whole alphabet is open = about 1700-1900
			// words, ~60 rounds of 30 words, about an hour at the goal speed
			// of 30 WPM: the list grows by ~200 words every 6 minutes of typing.
			RampLetters: 10000,
		},
		Freeplay: freeplay.Params{
			PortionWords:  6,   // the same stream as in learning: one line per portion...
			AheadPortions: 2,   // ...two waiting...
			RoundPortions: 5,   // ...and rounds of 30 words
			RecentWords:   20,  // "do not repeat" looks at the last 20 words
			RepeatPenalty: 0.3, // a word used recently is rarer, as in learning

			// The levels (docs/ALGORITHM.md section 12): ten levels, words
			// only, speed never counts. Each level brings
			// rarer, longer words: the average word grows from 4.0 letters
			// (200) to 7.3 (25 000). Levels 1, 3, 6, 8 and 10 are monkeytype's
			// lists (200, 1k, 5k, 10k, 25k), so a typist can compare.
			Levels:       []int{200, 500, 1000, 2000, 3000, 5000, 7500, 10000, 15000, 25000},
			LevelStart:   1,  // a new typist starts with the common words; the round bar offers any level
			PassAccuracy: 96, // a pass: at most ~1 mistake in 25 letters...
			FailAccuracy: 92, // a fail: more than ~1 in 12
			PassesUp:     3,  // three passes prove the level, one could be luck
			FailsDown:    2,  // one bad round is a slip, two in a row say the level is too hard
			History:      50, // a run at one level longer than 50 rounds counts from its last 50
			MinLetters:   2,  // no one-letter words ("a", "i"): nothing to train in them

			// The typist's weak letter pairs (freeplay/weak.go). 20 rounds of
			// 30 words are ~3000 pair presses: a common pair gets 100+, so the
			// cost is steady; 15 presses keep a pair seen once or twice out.
			WeakRounds:     20,
			WeakMinSamples: 15,
			WeakMissMs:     1000, // a mistake costs as much as learning's slowest press (SlowMs)
			WeakPairs:      3,    // a few at once: the text stays varied
			WeakShare:      0.5,  // half the words: the practice is felt, the text is still plain typing
			WeakMinWords:   10,   // fewer words with the pairs would repeat within a round

			// Freetype: the lists of monkeytype's English (200, 1k, 5k, 10k,
			// 25k most common words); data/langs/en/free.txt has 25 000.
			FreetypeLists: []int{200, 1000, 5000, 10000, 25000},
			// Freetype's kinds of text (after keybr and monkeytype). Long
			// words: 6+ letters, a quarter of the 1000
			// most common English words and most of the rarer ones.
			LongMin: 6,
			// Real sentences and your own text: letters, capitals and these
			// marks (tools/sentences/build.py keeps only such sentences).
			TextMarks:     ".,?!;:'-",
			SentenceTries: 20, // a sentence of the round comes again only on a very short list
		},
		// A made-up typist: assumptions of the simulation, not measured values.
		// docs/ALGORITHM.md section 10 explains them.
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
