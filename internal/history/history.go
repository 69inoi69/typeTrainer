// Package history draws the stats screen's conclusions from finished rounds.
package history

import (
	"math"
	"sort"

	"typingtrainer/internal/engine"
	"typingtrainer/internal/storage"
)

type Streak struct {
	Min     float64 `json:"min"`
	Longest int     `json:"longest"`
	Current int     `json:"current"`
}

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

func roundPct(v float64) float64 {
	return float64(int(v + 0.5))
}

type LetterState struct {
	Count     int     `json:"count"`
	Mistakes  int     `json:"mistakes"`
	ErrorRate float64 `json:"errorRate"`
	AvgMs     float64 `json:"avgMs"`
	Mastered  bool    `json:"mastered"`
}

type Round struct {
	WPM      float64        `json:"wpm"`
	Accuracy float64        `json:"accuracy"`
	Unlocked int            `json:"unlocked"`
	Letters  []*LetterState `json:"letters"`
	Lap      int            `json:"lap,omitempty"`
}

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

type Forecast struct {
	Known  bool   `json:"known"`
	Rounds int    `json:"rounds,omitempty"`
	More   bool   `json:"more,omitempty"`
	Letter string `json:"letter,omitempty"`
	Few    bool   `json:"few,omitempty"`
}

func NextForecast(rounds []Round, order []string, stats map[string]engine.KeyStat, unlocked int, p engine.Params, fp engine.ForecastParams) Forecast {
	out := Forecast{}
	for i, c := range order[:min(unlocked, len(order))] {
		now := stats[c]
		if engine.Mastered(now, p) {
			continue
		}
		var pts []engine.Point
		for _, r := range rounds {
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

type Confusion struct {
	Want  string `json:"want"`
	Typed string `json:"typed"`
	N     int    `json:"n"`
}

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
