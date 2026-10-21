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
	Mistakes  int     `json:"mistakes"`  // presses with a mistake so far (for the forecast)
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
	Lap      int            `json:"lap,omitempty"` // Learn's lap (storage.Session.Lap)
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
// Each round is judged at the goal of its own lap (Session.Lap,
// engine.Params.ForLap), and a new lap starts as the trainer starts it
// (engine.StartLap).
func LetterTimeline(sessions []storage.Session, order []string, first int, p engine.Params, lp engine.LapParams) []Round {
	stats := map[string]engine.KeyStat{}
	open, lap := first, 0
	out := make([]Round, 0, len(sessions))
	for _, s := range sessions {
		if s.Lap > lap {
			stats, lap = engine.StartLap(stats), s.Lap
		}
		p := p.ForLap(s.Lap, lp)
		stats = engine.Apply(stats, s.Keys, p)
		if s.Unlocked > 0 {
			open = s.Unlocked
		}
		r := Round{WPM: s.WPM, Accuracy: s.Accuracy, Unlocked: open, Lap: s.Lap, Letters: make([]*LetterState, len(order))}
		for i, c := range order {
			if i >= open {
				break
			}
			k := stats[c]
			r.Letters[i] = &LetterState{Count: k.Count, Mistakes: k.Mistakes, ErrorRate: round3(k.ErrEMA), AvgMs: math.Round(k.TimeEMA), Mastered: engine.Mastered(k, p)}
		}
		out = append(out, r)
	}
	return out
}

func round3(v float64) float64 { return math.Round(v*1000) / 1000 }

// Forecast is about how many rounds until the next letter opens (or, with
// every letter open, until the lap is done): the rounds the slowest
// waiting letter still needs (engine.RoundsToMastery), since the next
// letter waits for all of them.
//   - Known: there is an answer; Rounds is it, More: more than MaxRounds.
//   - Not Known: Letter has no honest answer yet (Few: too few rounds of
//     it, else it is not getting better).
//   - Letter "" and not Known: no letter is waiting.
type Forecast struct {
	Known  bool   `json:"known"`
	Rounds int    `json:"rounds,omitempty"`
	More   bool   `json:"more,omitempty"`
	Letter string `json:"letter,omitempty"`
	Few    bool   `json:"few,omitempty"`
}

// NextForecast reads the rounds (LetterTimeline) for the open letters
// (the first unlocked of order) that are not mastered now (stats: the
// model as the trainer has it, at p, the goal of the current lap). Each
// letter's points are its numbers after its rounds, the last one taken
// from stats: the replay misses rounds dropped with Tab, the trainer
// does not.
func NextForecast(rounds []Round, order []string, stats map[string]engine.KeyStat, unlocked int, p engine.Params, fp engine.ForecastParams) Forecast {
	out := Forecast{}
	for i, c := range order[:min(unlocked, len(order))] {
		now := stats[c]
		if engine.Mastered(now, p) {
			continue
		}
		var pts []engine.Point
		for _, r := range rounds {
			// a round before the letter's first press (or a round without
			// raw keys) says nothing about its trend
			if k := r.Letters[i]; k != nil && k.Count > 0 {
				pts = append(pts, engine.Point{Count: k.Count, Mistakes: k.Mistakes, ErrEMA: k.ErrorRate, TimeEMA: k.AvgMs})
			}
		}
		last := engine.Point{Count: now.Count, Mistakes: now.Mistakes, ErrEMA: now.ErrEMA, TimeEMA: now.TimeEMA}
		if len(pts) > 0 {
			pts[len(pts)-1] = last
		} else {
			pts = []engine.Point{last}
		}
		n, ok := engine.RoundsToMastery(pts, p, fp)
		if !ok {
			// no answer for one letter: none for the next letter either
			return Forecast{Letter: c, Few: len(pts) < fp.MinRounds}
		}
		if out.Letter == "" || n > out.Rounds {
			out = Forecast{Known: true, Rounds: n, Letter: c}
		}
	}
	if out.Rounds > fp.MaxRounds {
		out.Rounds, out.More = fp.MaxRounds, true
	}
	return out
}

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
