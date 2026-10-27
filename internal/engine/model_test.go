package engine

import (
	"math"
	"testing"
)

var testParams = Params{
	Alpha: 0.1, MaxIntervalMs: 2000,
	TargetWPM: 30, SlowMs: 1000, MaxErrorRate: 0.25, ErrorWeight: 0.6, SpeedWeight: 0.4,
	PriorDifficulty: 0.7, PriorStrength: 5,
	Temperature:       0.1,
	MasteryMinSamples: 20, MasteryErrorRate: 0.05,
	KeepErrorRate: 0.10, KeepSlowdown: 0.10, UnmasteredBonus: 0.2, HomeBoost: 4,
	StartLetters: 6, MinWords: 30, RepeatPenalty: 0.3, MinWordLetters: 2, MaxRepeats: 2, ExerciseWords: 20,
	PortionWords: 6, AheadPortions: 2, RecentWords: 24, RetryWords: 2, RoundPortions: 5,
	RankStart: 200, RankStep: 200, RankPenalty: 0.5,
}

func near(a, b float64) bool { return math.Abs(a-b) < 1e-9 }

func repeat(s KeyStat, smp Sample, n int) KeyStat {
	for i := 0; i < n; i++ {
		s = Update(s, smp, testParams)
	}
	return s
}

func TestTargetMs(t *testing.T) {
	if got := testParams.TargetMs(); !near(got, 400) {
		t.Fatalf("got %v, want 400", got)
	}
}

func TestUpdate_FirstSamplesAreAPlainAverage(t *testing.T) {
	s := Update(KeyStat{}, Sample{Char: "a", Ms: 200}, testParams)
	s = Update(s, Sample{Char: "a", Ms: 400}, testParams)
	if !near(s.TimeEMA, 300) {
		t.Fatalf("TimeEMA = %v, want 300", s.TimeEMA)
	}
}

func TestUpdate_RecentDataWins(t *testing.T) {
	s := repeat(KeyStat{}, Sample{Errors: 1}, 50)
	s = repeat(s, Sample{Ms: 300}, 50)
	if s.ErrEMA > 0.01 {
		t.Fatalf("ErrEMA = %v, expected the old mistakes to fade", s.ErrEMA)
	}
	if s.Mistakes != 50 || s.Count != 100 {
		t.Fatalf("lifetime counters wrong: %+v", s)
	}
}

func TestUpdate_IgnoresPausesAndRetries(t *testing.T) {
	s := Update(KeyStat{}, Sample{Ms: 5000}, testParams)
	s = Update(s, Sample{Errors: 2, Ms: 300}, testParams)
	s = Update(s, Sample{Ms: 0}, testParams)
	if s.TimedCount != 0 || s.Count != 3 {
		t.Fatalf("no sample should be timed: %+v", s)
	}
}

func TestDifficulty_UnknownLetterEqualsPrior(t *testing.T) {
	if got := Difficulty(KeyStat{}, testParams); !near(got, testParams.PriorDifficulty) {
		t.Fatalf("got %v, want prior %v", got, testParams.PriorDifficulty)
	}
}

func TestDifficulty_ShrinkageNeedsEvidence(t *testing.T) {
	one := Update(KeyStat{}, Sample{Ms: 200}, testParams)
	if d := Difficulty(one, testParams); d < 0.5 {
		t.Fatalf("after 1 sample difficulty = %v, should still be close to the prior", d)
	}
	many := repeat(KeyStat{}, Sample{Ms: 200}, 100)
	if d := Difficulty(many, testParams); d > 0.05 {
		t.Fatalf("after 100 perfect samples difficulty = %v, should be near 0", d)
	}
}

func TestRawDifficulty_Bounds(t *testing.T) {
	worst := KeyStat{Count: 10, ErrEMA: 1, TimeEMA: 5000, TimedCount: 10}
	best := KeyStat{Count: 10, ErrEMA: 0, TimeEMA: 100, TimedCount: 10}
	if d := RawDifficulty(worst, testParams); !near(d, 1) {
		t.Errorf("worst = %v, want 1", d)
	}
	if d := RawDifficulty(best, testParams); !near(d, 0) {
		t.Errorf("best = %v, want 0", d)
	}
	mid := KeyStat{Count: 10, TimeEMA: 700, TimedCount: 10}
	if d := RawDifficulty(mid, testParams); !near(d, 0.2) {
		t.Errorf("mid = %v, want 0.2", d)
	}
}

func TestMastered(t *testing.T) {
	fast := repeat(KeyStat{}, Sample{Ms: 300}, 20)
	if !Mastered(fast, testParams) {
		t.Error("20 clean presses at 300 ms should be mastered")
	}
	if Mastered(repeat(KeyStat{}, Sample{Ms: 300}, 19), testParams) {
		t.Error("19 samples is below MasteryMinSamples")
	}
	if Mastered(repeat(KeyStat{}, Sample{Ms: 600}, 50), testParams) {
		t.Error("600 ms is slower than the 400 ms target")
	}
}

func TestSoftmaxWeight_TemperatureControlsFocus(t *testing.T) {
	ratio := SoftmaxWeight(1, testParams) / SoftmaxWeight(0, testParams)
	if !near(ratio/math.Exp(10), 1) {
		t.Fatalf("ratio = %v, want e^10", ratio)
	}
	hot := testParams
	hot.Temperature = 10
	if r := SoftmaxWeight(1, hot) / SoftmaxWeight(0, hot); r > 1.2 {
		t.Fatalf("high temperature should make letters almost equal, ratio = %v", r)
	}
	if SoftmaxWeight(0, testParams) <= 0 {
		t.Fatal("weight must never be 0")
	}
}

func clean(s KeyStat, ms float64, n int) KeyStat {
	return repeat(s, Sample{Char: "a", Ms: ms}, n)
}

func TestHeld_OneSlipKeepsMastery(t *testing.T) {
	s := clean(KeyStat{}, 300, 25)
	if !s.Held || !Mastered(s, testParams) {
		t.Fatalf("25 clean presses at 300 ms: want mastered and held, got %+v", s)
	}
	s = Update(s, Sample{Char: "a", Errors: 1}, testParams)
	if MeetsGoal(s, testParams) {
		t.Fatalf("after a mistake the letter should be below the goal right now (ErrEMA %.3f)", s.ErrEMA)
	}
	if !Mastered(s, testParams) {
		t.Errorf("one mistake took the mastery back (ErrEMA %.3f, keep up to %.2f)", s.ErrEMA, testParams.KeepErrorRate)
	}
}

func TestHeld_ClearlyWorseLosesMastery(t *testing.T) {
	s := clean(KeyStat{}, 300, 25)
	for i := 0; i < 3; i++ {
		s = Update(s, Sample{Char: "a", Errors: 1}, testParams)
	}
	if Mastered(s, testParams) {
		t.Errorf("three mistakes in a row (ErrEMA %.3f): still mastered", s.ErrEMA)
	}
	s = clean(KeyStat{}, 300, 25)
	s = clean(s, 520, 30)
	if Mastered(s, testParams) {
		t.Errorf("TimeEMA %.0f ms, over the keep limit: still mastered", s.TimeEMA)
	}
	s = clean(KeyStat{}, 300, 25)
	s = clean(s, 430, 30)
	if !Mastered(s, testParams) {
		t.Errorf("TimeEMA %.0f ms, inside the keep limit: lost the mastery", s.TimeEMA)
	}
}

func TestHeld_NeedsTheGoalFirst(t *testing.T) {
	s := clean(KeyStat{}, 430, 40)
	if s.Held || Mastered(s, testParams) {
		t.Errorf("a letter at %.0f ms that never met the goal counts as mastered", s.TimeEMA)
	}
}

func TestHeld_NoMarginIsThePlainGoal(t *testing.T) {
	p := testParams
	p.KeepErrorRate, p.KeepSlowdown = 0, 0
	s := KeyStat{}
	for i := 0; i < 25; i++ {
		s = Update(s, Sample{Char: "a", Ms: 300}, p)
	}
	s = Update(s, Sample{Char: "a", Errors: 1}, p)
	if Mastered(s, p) {
		t.Errorf("no margin: one mistake should take the mastery back (ErrEMA %.3f)", s.ErrEMA)
	}
}
