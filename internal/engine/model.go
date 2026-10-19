// Package engine contains the adaptive learning model.
//
// It knows NOTHING about HTTP or databases: statistics go in, numbers and
// exercise text come out. That keeps it easy to test and easy to explain.
// It must not import anything from this project or anything about HTTP,
// JSON handlers or storage (docs/ARCHITECTURE.md, "Dependency rule").
// internal/api calls it to update a user's letters and to build the next
// words; internal/sim and tools/sim call it to simulate a typist;
// internal/storage uses only its KeyStat type. Its numbers come from
// internal/config.
//
// The files:
//   - model.go: per-letter statistics and difficulty (this file)
//   - generator.go: unlock order, unlocking and word choice
//   - consistency.go: how even the speed of a finished round was
//
// This file is the MATH: how one letter's statistics are updated and how
// they become a difficulty score. generator.go uses these scores to pick
// words and to decide when a new letter is unlocked.
// The full explanation with reasoning is in docs/ALGORITHM.md, sections 4-5.
package engine

import "math"

// Params are the tunable numbers of the model and of the word choice.
// Values and the reasons for them live in internal/config (Default) and
// docs/ALGORITHM.md section 8.
type Params struct {
	Alpha         float64 // EMA smoothing factor (0..1); bigger = reacts faster, forgets faster
	MaxIntervalMs float64 // a gap longer than this is a pause, not a reaction time

	TargetWPM    float64 // speed goal; a letter at this speed has speed difficulty 0
	SlowMs       float64 // per-letter time treated as "maximally slow" (speed difficulty 1)
	MaxErrorRate float64 // error rate treated as "maximally bad" (error difficulty 1)
	ErrorWeight  float64 // share of difficulty from mistakes (ErrorWeight + SpeedWeight = 1)
	SpeedWeight  float64 // share of difficulty from slowness

	PriorDifficulty float64 // what we assume about a letter before seeing it
	PriorStrength   float64 // how many samples the prior is "worth"

	Temperature float64 // softmax temperature: low = focus hard on weak letters, high = spread out

	MasteryMinSamples int     // a letter needs this many samples before it can count as mastered
	MasteryErrorRate  float64 // ...and a smoothed error rate at or below this
	// Once mastered, a letter stays mastered until it is clearly worse
	// (KeyStat.Held): one slip no longer takes it back (docs/ALGORITHM.md
	// section 6). Values at or below the goal = no such margin.
	KeepErrorRate float64 // a mastered letter stays mastered up to this error rate
	KeepSlowdown  float64 // ...and up to TargetMs * (1 + KeepSlowdown)

	// UnmasteredBonus is added to the difficulty of every open letter that
	// is not mastered yet, for the focus and the word choice only: a letter
	// that holds back the next one is practised more, even when it is only
	// a little slow. Softmax ignores a shift that every letter gets, so it
	// changes nothing while no letter is mastered.
	UnmasteredBonus float64

	// HomeBoost: when the unlock order is made, a letter under a resting
	// finger (asdf jkl; on QWERTY) counts as this many times as frequent, so
	// the first lessons sit on the home row (generator.go SetHome). 1 = plain
	// frequency.
	HomeBoost float64

	StartLetters  int     // first lesson has at least this many letters
	MinWords      int     // ...and enough letters to build at least this many real words
	RepeatPenalty float64 // weight multiplier for a word already used in the same exercise
	ExerciseWords int     // words per exercise (Next: the whole text at once)

	// The stream (Portion): the text is built a few words at a time while the
	// user types, always from the newest statistics.
	PortionWords  int // words per portion; one focus letter per portion
	AheadPortions int // portions waiting after the one being typed
	RecentWords   int // RepeatPenalty counts uses in the last this many words
	RetryWords    int // at most this many mistyped words come back in a portion
	RoundPortions int // a round (one result in the history) is this many portions

	// Common words first (generator.go, RankWeight): the most frequent words
	// of the list at the start, rarer ones as more letters open.
	RankStart   int     // words up to this frequency rank come freely in the first lesson
	RankStep    float64 // every RankStep ranks over the limit multiply the weight by RankPenalty
	RankPenalty float64 // weight multiplier per RankStep over the limit; outside (0, 1) = no penalty
}

// TargetMs converts TargetWPM to milliseconds per character.
// Standard definition: 1 word = 5 characters, so ms = 60000 / (WPM * 5),
// which is 12000 / WPM (30 WPM -> 400 ms).
func (p Params) TargetMs() float64 { return 12000 / p.TargetWPM }

// Sample is ONE occurrence of a character in an exercise, sent by the browser
// (web/typing.js measures it, POST /api/v1/results brings it here).
//   - Errors: wrong keys pressed at this position, also when later fixed
//     with Backspace (0 = clean)
//   - Ms:     time from the previous keypress to the first press here;
//     0 = not measured (first press of the exercise, or right after a Backspace)
type Sample struct {
	Char   string  `json:"char"`
	Errors int     `json:"errors"`
	Ms     float64 `json:"ms"`
}

// KeyStat is everything we remember about one letter. The storage keeps one
// per user, language and letter; a missing letter is the zero KeyStat.
type KeyStat struct {
	Count      int     `json:"count"`      // occurrences typed (lifetime)
	Mistakes   int     `json:"mistakes"`   // occurrences with at least one error (lifetime)
	ErrEMA     float64 `json:"errEma"`     // smoothed probability of making a mistake
	TimeEMA    float64 `json:"timeEma"`    // smoothed time per keypress, ms (clean presses only)
	TimedCount int     `json:"timedCount"` // samples included in TimeEMA
	// Held: the letter reached the goal (MeetsGoal) and has not been clearly
	// worse since (KeepErrorRate, KeepSlowdown). Set by Update.
	Held bool `json:"held,omitempty"`
}

// emaStep is the smoothing factor for the n-th sample (docs/ALGORITHM.md
// section 4).
//
// Plain EMA:   new = old + alpha * (x - old)
// Problem: the very first samples would be pulled towards the start value 0.
// Fix: for the first samples use 1/n (that is an ordinary average), and switch
// to alpha once 1/n gets smaller than alpha (after 1/alpha samples).
// So: a fair average while data is scarce, a "recent matters more" average later.
func emaStep(n int, alpha float64) float64 {
	return math.Max(alpha, 1/float64(n))
}

// Update adds one sample to a letter's statistics and returns the new stats.
// The lifetime counters (Count, Mistakes) only grow; the EMAs follow the
// recent past.
func Update(s KeyStat, smp Sample, p Params) KeyStat {
	s.Count++
	miss := 0.0
	if smp.Errors > 0 {
		miss = 1
		s.Mistakes++
	}
	s.ErrEMA += emaStep(s.Count, p.Alpha) * (miss - s.ErrEMA)

	// Only clean presses tell us how fast the finger really is. A press after
	// a mistake includes "noticing the mistake" time, and long gaps are pauses.
	if smp.Errors == 0 && smp.Ms > 0 && smp.Ms <= p.MaxIntervalMs {
		s.TimedCount++
		s.TimeEMA += emaStep(s.TimedCount, p.Alpha) * (smp.Ms - s.TimeEMA)
	}
	if s.Held {
		s.Held = keeps(s, p)
	} else {
		s.Held = MeetsGoal(s, p)
	}
	return s
}

// Apply adds a whole exercise of samples. The input map is not modified
// (a copy is returned), so the caller can still compare before and after.
// A letter seen for the first time starts from the zero KeyStat.
func Apply(stats map[string]KeyStat, samples []Sample, p Params) map[string]KeyStat {
	out := make(map[string]KeyStat, len(stats))
	for k, v := range stats {
		out[k] = v
	}
	for _, smp := range samples {
		out[smp.Char] = Update(out[smp.Char], smp, p)
	}
	return out
}

func clamp01(x float64) float64 { return math.Max(0, math.Min(1, x)) }

// RawDifficulty is what the data alone says, from 0 (easy) to 1 (hard)
// (docs/ALGORITHM.md section 5.1):
//
//	errorPart = clamp(ErrEMA / MaxErrorRate)
//	speedPart = clamp((TimeEMA - TargetMs) / (SlowMs - TargetMs))
//	raw       = ErrorWeight * errorPart + SpeedWeight * speedPart
//
// speedPart is 0 at (or faster than) the target speed and 1 at SlowMs.
// A letter with no clean timed press yet gets speedPart = 1 (we cannot
// call it fast if we never saw it typed cleanly).
func RawDifficulty(s KeyStat, p Params) float64 {
	errorPart := clamp01(s.ErrEMA / p.MaxErrorRate)
	speedPart := 1.0
	if s.TimedCount > 0 {
		speedPart = clamp01((s.TimeEMA - p.TargetMs()) / (p.SlowMs - p.TargetMs()))
	}
	return p.ErrorWeight*errorPart + p.SpeedWeight*speedPart
}

// Difficulty is the raw difficulty pulled towards a prior while data is scarce
// ("shrinkage", the same idea as a Bayesian average; docs/ALGORITHM.md
// section 5.2):
//
//	difficulty = (n * raw + k * prior) / (n + k)
//
// n = samples seen, k = PriorStrength. With n = 0 it equals the prior, with
// n much bigger than k it is almost the raw value. Without this, a letter typed
// correctly once would look "perfect" and would stop being practised.
func Difficulty(s KeyStat, p Params) float64 {
	n := float64(s.Count)
	k := p.PriorStrength
	if n+k == 0 {
		return p.PriorDifficulty
	}
	return (n*RawDifficulty(s, p) + k*p.PriorDifficulty) / (n + k)
}

// MeetsGoal says whether a letter is at the goal right now: enough samples,
// few mistakes, and at least target speed. This is a plain yes/no rule on
// the raw numbers so it is easy to explain to a user ("type e at 30 WPM
// with under 5% mistakes"). It uses the raw numbers, not Difficulty, so the
// prior never holds a letter back once the data is there (docs/ALGORITHM.md
// section 6).
func MeetsGoal(s KeyStat, p Params) bool {
	return s.Count >= p.MasteryMinSamples &&
		s.ErrEMA <= p.MasteryErrorRate &&
		s.TimedCount > 0 && s.TimeEMA <= p.TargetMs()
}

// keeps says whether a letter that was mastered stays mastered: it may get
// a little worse than the goal, but not clearly worse. Without this margin
// one mistake (ErrEMA jumps by Alpha = 0.1, over the 0.05 goal) took a
// mastered letter back for about 7 presses, and the next letter waited until
// every open letter happened to be clean at the same moment (the audit,
// docs/ALGORITHM-AUDIT.md section 3.1).
func keeps(s KeyStat, p Params) bool {
	return s.ErrEMA <= max(p.KeepErrorRate, p.MasteryErrorRate) &&
		s.TimedCount > 0 && s.TimeEMA <= p.TargetMs()*(1+max(0, p.KeepSlowdown))
}

// Mastered says whether a letter counts as mastered: it reached the goal
// and has not been clearly worse since (Held), or it is at the goal now (a
// letter from before Held existed). The next letter opens when every open
// letter is mastered (generator.go NextUnlocked).
func Mastered(s KeyStat, p Params) bool {
	return s.Held || MeetsGoal(s, p)
}

// SoftmaxWeight turns difficulty into a selection weight:
//
//	weight = exp(difficulty / Temperature)
//	P(letter) = weight / sum of all weights
//
// Temperature controls focus. With T = 0.1 (the current value in
// internal/config), a letter with difficulty 1 is e^10 ~ 22000 times more
// likely than one with difficulty 0; with T = 0.25 it would be e^4 ~ 55. With a large T
// all letters become almost equally likely. exp() is never 0, so no letter
// ever disappears completely.
func SoftmaxWeight(difficulty float64, p Params) float64 {
	return math.Exp(difficulty / p.Temperature)
}
