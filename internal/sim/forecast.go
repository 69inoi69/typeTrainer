package sim

// How good is the forecast of the Learn panel (engine.RoundsToMastery,
// docs/ALGORITHM.md 6.2)? The simulated typist practises with the stream
// as in the app; after every round the forecast for the next letter is
// made exactly as history.NextForecast makes it (the slowest waiting
// letter decides), and later compared with the rounds the next letter
// really took to open. Results: docs/ALGORITHM.md section 10 ("Forecast").

import (
	"sort"

	"typingtrainer/internal/engine"
)

// ForecastCheck is one forecast and what really happened.
type ForecastCheck struct {
	Said   int  // rounds forecast (MaxRounds + 1 = "more than MaxRounds")
	Actual int  // rounds until the next letter really opened
	More   bool // the forecast was "more than MaxRounds"
}

// ForecastRun is what Forecasts saw in one run: the checks, the rounds
// played while a letter was still locked, and in how many of them the
// forecast had an answer (the rest show no number on the panel).
type ForecastRun struct {
	Checks           []ForecastCheck
	Rounds, Answered int
}

// Forecasts lets one typist practise with the stream (s) until every letter
// is open or maxRounds rounds pass, and returns every forecast that had an
// answer, each with the rounds the next letter really needed. A forecast
// made in a round with no later unlock (the run ended first) is dropped:
// its true answer is unknown.
func Forecasts(gen *engine.Generator, s *Stream, t *Typist, ep engine.Params, fp engine.ForecastParams, maxRounds int) ForecastRun {
	stats := map[string]engine.KeyStat{}
	unlocked := gen.Start()
	points := map[string][]engine.Point{} // each letter's numbers after each round, since its first press
	type pending struct{ round, said int }
	var waiting []pending // forecasts made since the last unlock
	var out ForecastRun
	all := len(gen.Order())
	for round := 1; round <= maxRounds && unlocked < all; round++ {
		before := unlocked
		for range ep.RoundPortions {
			text := s.Text(stats, unlocked, 0)
			samples := typeNext(s, t, text)
			s.Observe(samples)
			stats = engine.Apply(stats, samples, ep)
			unlocked = gen.NextUnlocked(stats, unlocked, ep)
		}
		if unlocked > before { // the letter opened in this round: check the forecasts
			for _, w := range waiting {
				out.Checks = append(out.Checks, ForecastCheck{Said: w.said, Actual: round - w.round, More: w.said > fp.MaxRounds})
			}
			waiting = nil
		}
		for _, c := range gen.Order()[:unlocked] {
			if k := stats[c]; k.Count > 0 {
				points[c] = append(points[c], engine.Point{Count: k.Count, Mistakes: k.Mistakes, ErrEMA: k.ErrEMA, TimeEMA: k.TimeEMA})
			}
		}
		if unlocked == all {
			break
		}
		out.Rounds++
		if said, ok := nextLetterForecast(points, stats, gen.Order()[:unlocked], ep, fp); ok {
			out.Answered++
			waiting = append(waiting, pending{round, said})
		}
	}
	return out
}

// nextLetterForecast is history.NextForecast's rule: the most rounds any
// open letter not mastered yet needs; no answer if one of them has none.
func nextLetterForecast(points map[string][]engine.Point, stats map[string]engine.KeyStat, open []string, ep engine.Params, fp engine.ForecastParams) (int, bool) {
	most, any := 0, false
	for _, c := range open {
		if engine.Mastered(stats[c], ep) {
			continue
		}
		n, ok := engine.RoundsToMastery(points[c], ep, fp)
		if !ok {
			return 0, false
		}
		most, any = max(most, n), true
	}
	return most, any
}

// ForecastSummary sums up the checks of the forecasts that gave a number
// (not "more than MaxRounds"):
//   - MeanAbs, MedianAbs: the error in rounds, |said - actual|;
//   - Within: the share off by at most max(2 rounds, a quarter of actual);
//   - Early: the share that said fewer rounds than it took (too hopeful).
//
// N is how many there were, More how many said "more than MaxRounds",
// MoreRight how many of those really took that long; Shown is the share of
// rounds that had a forecast at all.
type ForecastSummary struct {
	N, More, MoreRight        int
	MeanAbs, MedianAbs        float64
	Within, Early, MeanActual float64
	Shown                     float64
}

// Summarize sums up runs (ForecastSummary).
func Summarize(runs []ForecastRun, fp engine.ForecastParams) ForecastSummary {
	var s ForecastSummary
	var checks []ForecastCheck
	rounds, answered := 0, 0
	for _, r := range runs {
		checks = append(checks, r.Checks...)
		rounds += r.Rounds
		answered += r.Answered
	}
	if rounds > 0 {
		s.Shown = float64(answered) / float64(rounds)
	}
	var errs []float64
	within, early, actual := 0, 0, 0
	for _, c := range checks {
		if c.More {
			s.More++
			if c.Actual > fp.MaxRounds {
				s.MoreRight++
			}
			continue
		}
		e := float64(c.Said - c.Actual)
		if e < 0 {
			early++
			e = -e
		}
		if e <= max(2, float64(c.Actual)/4) {
			within++
		}
		errs = append(errs, e)
		actual += c.Actual
	}
	s.N = len(errs)
	if s.N == 0 {
		return s
	}
	sort.Float64s(errs)
	for _, e := range errs {
		s.MeanAbs += e
	}
	s.MeanAbs /= float64(s.N)
	s.MedianAbs = errs[s.N/2]
	if s.N%2 == 0 {
		s.MedianAbs = (errs[s.N/2-1] + errs[s.N/2]) / 2
	}
	s.Within = float64(within) / float64(s.N)
	s.Early = float64(early) / float64(s.N)
	s.MeanActual = float64(actual) / float64(s.N)
	return s
}
