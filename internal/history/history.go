// Package history reads a typist's finished rounds (storage.Session) and
// draws conclusions the stats screen shows: how many rounds in a row were
// accurate, how every letter grew round by round in Learn, which keys get
// mixed up. It never changes anything and knows nothing about HTTP or
// databases: internal/api loads the rounds and hands them in.
//
// To add a reading of the history: a pure function here over sessions
// oldest first, a test in history_test.go, and its field in the stats
// answer (internal/api).
package history

import (
	"math"
	"sort"

	"typingtrainer/internal/engine"
	"typingtrainer/internal/storage"
)

// Streak is the accuracy streak at one threshold: rounds in a row with at
// least Min % accuracy. Longest is the record over the whole history,
// Current the run that ends with the last round (0 if the last round was
// below Min).
type Streak struct {
	Min     float64 `json:"min"`
	Longest int     `json:"longest"`
	Current int     `json:"current"`
}

// AccuracyStreaks returns one Streak per threshold in mins, in the same
// order. sessions are oldest first. Accuracy is rounded first (as the
// screen shows it), so a round shown as 95% counts for 95.
func AccuracyStreaks(sessions []storage.Session, mins []float64) []Streak {
	out := make([]Streak, len(mins))
	for i, m := range mins {
		out[i].Min = m
		run := 0
		for _, s := range sessions {
			if roundPct(s.Accuracy) >= m {
				run++
				out[i].Longest = max(out[i].Longest, run)
			} else {
				run = 0
			}
		}
		out[i].Current = run
	}
	return out
}

// roundPct rounds a percentage to a whole number, half up.
func roundPct(v float64) float64 {
	return float64(int(v + 0.5))
}

// LetterState is one letter after one round: the numbers the letters row
// shows (web/letters.js letterProgress turns them into its colour).
type LetterState struct {
	Count     int     `json:"count"`     // presses so far
	ErrorRate float64 `json:"errorRate"` // engine.KeyStat.ErrEMA, 0..1
	AvgMs     float64 `json:"avgMs"`     // engine.KeyStat.TimeEMA, 0 = not measured yet
	Mastered  bool    `json:"mastered"`  // engine.Mastered
}

// Round is the state of the open letters after one Learn round. Letters
// holds one entry per letter of the unlock order: nil while the letter
// was still locked.
type Round struct {
	WPM      float64        `json:"wpm"`
	Accuracy float64        `json:"accuracy"`
	Unlocked int            `json:"unlocked"`
	Letters  []*LetterState `json:"letters"`
}

// LetterTimeline replays the letter model over the Learn rounds (oldest
// first), round by round, from zero: what each letter looked like after
// every round. The model is the same engine.Apply the trainer runs, fed
// with each round's raw keys, so the picture follows the real rule. Two
// limits, said on the screen: rounds dropped with Tab (their presses did
// teach the model) and history without raw keys are not in the replay, so
// the last round can differ a little from the letters row.
// A round from before the number of open letters was kept (Unlocked 0)
// keeps the number of the round before (at least first, the first lesson).
func LetterTimeline(sessions []storage.Session, order []string, first int, p engine.Params) []Round {
	stats := map[string]engine.KeyStat{}
	open := first
	out := make([]Round, 0, len(sessions))
	for _, s := range sessions {
		stats = engine.Apply(stats, s.Keys, p)
		if s.Unlocked > 0 {
			open = s.Unlocked
		}
		r := Round{WPM: s.WPM, Accuracy: s.Accuracy, Unlocked: open, Letters: make([]*LetterState, len(order))}
		for i, c := range order {
			if i >= open {
				break
			}
			k := stats[c]
			r.Letters[i] = &LetterState{Count: k.Count, ErrorRate: round3(k.ErrEMA), AvgMs: math.Round(k.TimeEMA), Mastered: engine.Mastered(k, p)}
		}
		out = append(out, r)
	}
	return out
}

func round3(v float64) float64 { return math.Round(v*1000) / 1000 }

// Confusion is a pair of keys mixed up: Want was expected, Typed pressed
// instead, N times.
type Confusion struct {
	Want  string `json:"want"`
	Typed string `json:"typed"`
	N     int    `json:"n"`
}

// Confusions counts the wrong keys in the raw keys of the rounds
// (engine.Sample.Typed: the first wrong key at a place) and returns the
// pairs that happened at least `least` times, the most frequent first (ties
// in the order of the letters, so the answer never shuffles), at most
// limit of them. Rounds from before the wrong key was recorded add nothing.
func Confusions(sessions []storage.Session, least, limit int) []Confusion {
	type pair struct{ want, typed string }
	count := map[pair]int{}
	for _, s := range sessions {
		for _, k := range s.Keys {
			if k.Typed != "" && k.Typed != k.Char {
				count[pair{k.Char, k.Typed}]++
			}
		}
	}
	out := []Confusion{}
	for p, n := range count {
		if n >= least {
			out = append(out, Confusion{Want: p.want, Typed: p.typed, N: n})
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].N != out[j].N {
			return out[i].N > out[j].N
		}
		if out[i].Want != out[j].Want {
			return out[i].Want < out[j].Want
		}
		return out[i].Typed < out[j].Typed
	})
	return out[:min(len(out), limit)]
}
