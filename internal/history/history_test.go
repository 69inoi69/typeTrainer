package history

import (
	"testing"

	"typingtrainer/internal/config"
	"typingtrainer/internal/engine"
	"typingtrainer/internal/storage"
)

func rounds(acc ...float64) []storage.Session {
	out := make([]storage.Session, len(acc))
	for i, a := range acc {
		out[i].Accuracy = a
	}
	return out
}

func TestAccuracyStreaksEmpty(t *testing.T) {
	got := AccuracyStreaks(nil, []float64{95, 100})
	if len(got) != 2 || got[0] != (Streak{Min: 95}) || got[1] != (Streak{Min: 100}) {
		t.Fatalf("no rounds: got %+v", got)
	}
	if got := AccuracyStreaks(rounds(99), nil); len(got) != 0 {
		t.Fatalf("no thresholds: got %+v", got)
	}
}

func TestAccuracyStreaks(t *testing.T) {
	// 96 97 100 | 90 | 98 100 100 100 | 95
	s := rounds(96, 97, 100, 90, 98, 100, 100, 100, 95)
	got := AccuracyStreaks(s, []float64{95, 97, 100})
	want := []Streak{
		{Min: 95, Longest: 5, Current: 5}, // 98 100 100 100 95
		{Min: 97, Longest: 4, Current: 0}, // 98 100 100 100; the last 95 breaks it
		{Min: 100, Longest: 3, Current: 0},
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("min %v: got %+v, want %+v", want[i].Min, got[i], want[i])
		}
	}
}

func TestAccuracyStreaksRounding(t *testing.T) {
	// 94.5 is shown as 95 and counts; 99.4 is shown as 99 and does not reach 100
	got := AccuracyStreaks(rounds(94.5, 99.4), []float64{95, 100})
	if got[0].Longest != 2 || got[1].Longest != 0 {
		t.Fatalf("got %+v", got)
	}
}

func keys(spec ...engine.Sample) []engine.Sample { return spec }

func TestLetterTimelineEmpty(t *testing.T) {
	if got := LetterTimeline(nil, []string{"a", "b"}, 2, config.Default().Engine, config.Default().Laps); len(got) != 0 {
		t.Fatalf("no rounds: got %+v", got)
	}
}

func TestLetterTimeline(t *testing.T) {
	p := config.Default().Engine
	order := []string{"a", "b", "c"}
	s := []storage.Session{
		{WPM: 20, Accuracy: 90, Unlocked: 2, Keys: keys(
			engine.Sample{Char: "a", Ms: 400}, engine.Sample{Char: "b", Errors: 1, Ms: 500, Typed: "n"})},
		{WPM: 25, Accuracy: 100, Unlocked: 0, Keys: nil}, // old history: no keys, no number of letters
		{WPM: 30, Accuracy: 95, Unlocked: 3, Keys: keys(engine.Sample{Char: "c", Ms: 300})},
	}
	got := LetterTimeline(s, order, 2, p, config.Default().Laps)
	if len(got) != 3 {
		t.Fatalf("want 3 rounds, got %d", len(got))
	}
	r0 := got[0]
	if r0.Unlocked != 2 || r0.Letters[2] != nil || r0.Letters[0].Count != 1 || r0.Letters[1].ErrorRate != 1 {
		t.Errorf("round 1: %+v %+v %+v", r0, r0.Letters[0], r0.Letters[1])
	}
	if r0.Letters[0].AvgMs != 400 || r0.Letters[1].AvgMs != 0 {
		t.Errorf("round 1 times: a %v, b %v (a wrong press is not timed)", r0.Letters[0].AvgMs, r0.Letters[1].AvgMs)
	}
	// the round without keys keeps the letters as they were and the number open
	if got[1].Unlocked != 2 || *got[1].Letters[0] != *r0.Letters[0] {
		t.Errorf("round 2: %+v", got[1])
	}
	if got[2].Unlocked != 3 || got[2].Letters[2] == nil || got[2].Letters[2].Count != 1 {
		t.Errorf("round 3: %+v", got[2])
	}
}

// many presses of one letter at ms each, clean
func presses(c string, n int, ms float64) []engine.Sample {
	out := make([]engine.Sample, n)
	for i := range out {
		out[i] = engine.Sample{Char: c, Ms: ms}
	}
	return out
}

// A round of a later lap is judged at that lap's goal, and the new lap
// takes back every letter's mastery (engine.StartLap), as the trainer does.
func TestLetterTimelineLaps(t *testing.T) {
	cfg := config.Default()
	s := []storage.Session{
		{Unlocked: 1, Keys: presses("a", 30, 380)},        // 380 ms: mastered at 30 wpm (400 ms)
		{Unlocked: 1, Lap: 1, Keys: presses("a", 1, 380)}, // lap 1, 35 wpm = 343 ms: too slow now
		{Unlocked: 1, Lap: 1, Keys: presses("a", 40, 300)},
	}
	got := LetterTimeline(s, []string{"a"}, 1, cfg.Engine, cfg.Laps)
	if !got[0].Letters[0].Mastered || got[1].Letters[0].Mastered || !got[2].Letters[0].Mastered {
		t.Errorf("mastered by round: %v %v %v, want true false true",
			got[0].Letters[0].Mastered, got[1].Letters[0].Mastered, got[2].Letters[0].Mastered)
	}
	if got[1].Lap != 1 {
		t.Errorf("round 2 lap %d", got[1].Lap)
	}
}

// The forecast waits for the slowest letter; a letter without an answer
// means no answer; no letter waiting means nothing to say.
func TestNextForecast(t *testing.T) {
	p := config.Default().Engine
	fp := config.Default().Forecast
	order := []string{"a", "b", "c"}
	// a: mastered; b: 20 ms faster a round, 100 ms to go (5 rounds);
	// c: 10 ms a round, 100 ms to go (10 rounds)
	var rounds []Round
	for i := 0; i < 8; i++ {
		rounds = append(rounds, Round{Unlocked: 2, Letters: []*LetterState{
			{Count: 100, ErrorRate: 0.01, AvgMs: 300, Mastered: true},
			{Count: 30 + 10*i, ErrorRate: 0.02, AvgMs: float64(640 - 20*i)},
			{Count: 30 + 10*i, ErrorRate: 0.02, AvgMs: float64(570 - 10*i)},
		}})
	}
	now := map[string]engine.KeyStat{
		"a": {Count: 100, ErrEMA: 0.01, TimeEMA: 300, TimedCount: 100, Held: true},
		"b": {Count: 100, ErrEMA: 0.02, TimeEMA: 500, TimedCount: 100},
		"c": {Count: 100, ErrEMA: 0.02, TimeEMA: 500, TimedCount: 100},
	}
	if got := NextForecast(rounds, order, now, 2, p, fp); !got.Known || got.Rounds != 5 || got.Letter != "b" {
		t.Errorf("a and b open: %+v, want 5 rounds for b", got)
	}
	if got := NextForecast(rounds, order, now, 3, p, fp); !got.Known || got.Rounds != 10 || got.Letter != "c" {
		t.Errorf("all open: %+v, want 10 rounds for c", got)
	}
	if got := NextForecast(rounds[:fp.MinRounds-1], order, now, 2, p, fp); got.Known || got.Letter != "b" || !got.Few {
		t.Errorf("%d rounds: %+v, want no answer, too few rounds of b", fp.MinRounds-1, got)
	}
	if got := NextForecast(rounds, order, now, 1, p, fp); got.Known || got.Letter != "" {
		t.Errorf("only a open, mastered: %+v, want nothing", got)
	}
	if got := NextForecast(nil, order, nil, 2, p, fp); got.Known || got.Letter != "a" || !got.Few {
		t.Errorf("no rounds yet: %+v", got)
	}
}

func TestConfusions(t *testing.T) {
	s := []storage.Session{
		{Keys: keys(
			engine.Sample{Char: "r", Errors: 1, Typed: "t"},
			engine.Sample{Char: "r", Errors: 2, Typed: "t"},
			engine.Sample{Char: "e", Errors: 1, Typed: "w"},
			engine.Sample{Char: "e", Errors: 1}, // old history: no wrong key kept
		)},
		{Keys: keys(
			engine.Sample{Char: "r", Errors: 1, Typed: "t"},
			engine.Sample{Char: "a", Errors: 1, Typed: "s"},
			engine.Sample{Char: "e", Errors: 1, Typed: "w"},
		)},
	}
	got := Confusions(s, 2, 5)
	want := []Confusion{{Want: "r", Typed: "t", N: 3}, {Want: "e", Typed: "w", N: 2}}
	if len(got) != len(want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("%d: got %+v, want %+v", i, got[i], want[i])
		}
	}
	if got := Confusions(s, 1, 1); len(got) != 1 || got[0].Want != "r" {
		t.Errorf("limit 1: got %+v", got)
	}
	if got := Confusions(nil, 1, 5); len(got) != 0 {
		t.Errorf("no rounds: got %+v", got)
	}
}
