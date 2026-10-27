package sim

// How good the Learn forecast is.

import (
	"sort"

	"typingtrainer/internal/engine"
)

type ForecastCheck struct {
	Said   int
	Actual int
	More   bool
}

type ForecastRun struct {
	Checks           []ForecastCheck
	Rounds, Answered int
}

func Forecasts(gen *engine.Generator, s *Stream, t *Typist, ep engine.Params, fp engine.ForecastParams, maxRounds int) ForecastRun {
	stats := map[string]engine.KeyStat{}
	unlocked := gen.Start()
	points := map[string][]engine.Point{}
	type pending struct{ round, said int }
	var waiting []pending
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
		if unlocked > before {
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

type ForecastSummary struct {
	N, More, MoreRight        int
	MeanAbs, MedianAbs        float64
	Within, Early, MeanActual float64
	Shown                     float64
}

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
