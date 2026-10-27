package freeplay

import (
	"math"
	"math/rand"
	"slices"
	"strings"
	"testing"
)

var testParams = Params{
	PortionWords: 6, AheadPortions: 2, RoundPortions: 5, RecentWords: 20, RepeatPenalty: 0.3,
	Levels: []int{200, 500, 1000, 2000, 3000, 5000, 7500, 10000, 15000, 25000}, LevelStart: 1,
	PassAccuracy: 96, FailAccuracy: 92, PassesUp: 3, FailsDown: 2, History: 50, MinLetters: 2,
	WeakRounds: 20, WeakMinSamples: 15, WeakMissMs: 1000, WeakPairs: 3, WeakShare: 0.5, WeakMinWords: 10,
	LongMin: 6, TextMarks: ".,?!;:'-", SentenceTries: 20,
}

func plain() Params { return testParams }

func TestPortion_Uniform(t *testing.T) {
	words := []string{"a", "bb", "ccc", "dddd", "eeeee", "the", "zebra", "quixotic"}
	pk := NewPicker(words, rand.New(rand.NewSource(1)))
	p := plain()
	p.RecentWords = 0
	count := map[string]int{}
	const n = 80000
	for _, w := range pk.Portion(nil, n, 1, nil, p) {
		count[w]++
	}
	mean := float64(n) / float64(len(words))
	for _, w := range words {
		if d := math.Abs(float64(count[w])-mean) / mean; d > 0.05 {
			t.Errorf("%q: %d draws, mean %.0f (off by %.0f%%)", w, count[w], mean, d*100)
		}
	}
}

func TestMaxRank(t *testing.T) {
	words := make([]string, 1200)
	for i := range words {
		words[i] = strings.Repeat("a", i%7+1) + string(rune('a'+i%26))
	}
	pk := NewPicker(words, rand.New(rand.NewSource(1)))
	for _, c := range []struct{ level, want int }{{1, 200}, {2, 500}, {3, 1000}, {4, 1200}, {10, 1200}, {0, 200}, {-3, 200}, {11, 1200}} {
		if got := pk.MaxRank(c.level, testParams); got != c.want {
			t.Errorf("level %d: MaxRank %d, want %d", c.level, got, c.want)
		}
	}
	short := NewPicker([]string{"a", "b"}, rand.New(rand.NewSource(1)))
	if got := short.MaxRank(1, testParams); got != 2 {
		t.Errorf("a list shorter than the first level: %d, want 2", got)
	}
	if got := NewPicker(nil, rand.New(rand.NewSource(1))).MaxRank(5, testParams); got != 0 {
		t.Errorf("no words: MaxRank %d, want 0", got)
	}
	idx := map[string]int{}
	for i, w := range words {
		if _, ok := idx[w]; !ok {
			idx[w] = i
		}
	}
	for _, w := range pk.Portion(nil, 500, 1, nil, plain()) {
		if idx[w] >= 200 {
			t.Fatalf("level 1 gave %q at rank %d", w, idx[w])
		}
	}
}

func TestPortion_WordsOnly(t *testing.T) {
	words := []string{"one", "two", "three", "four", "five", "six", "seven", "eight"}
	pk := NewPicker(words, rand.New(rand.NewSource(5)))
	for level := 1; level <= 10; level++ {
		for _, w := range pk.Portion(nil, 200, level, nil, testParams) {
			if !slices.Contains(words, w) {
				t.Fatalf("level %d: %q is not a word of the list", level, w)
			}
		}
	}
}

func TestPortion_NeverTheSameWordTwiceInARow(t *testing.T) {
	pk := NewPicker([]string{"ab", "ba"}, rand.New(rand.NewSource(2)))
	got := pk.Portion([]string{"ab"}, 50, 1, nil, testParams)
	prev := "ab"
	for _, w := range got {
		if w == prev {
			t.Fatalf("%q twice in a row in %v", w, got)
		}
		prev = w
	}
}

func TestPortion_RecentWordsAreRarer(t *testing.T) {
	words := []string{"one", "two", "three"}
	pk := NewPicker(words, rand.New(rand.NewSource(3)))
	recent := []string{"one", "one", "one", "two"}
	count := map[string]int{}
	for i := 0; i < 3000; i++ {
		count[pk.Portion(recent, 1, 1, nil, plain())[0]]++
	}
	if count["two"] != 0 {
		t.Fatalf("the last word came again: %v", count)
	}
	if count["one"]*5 > count["three"] {
		t.Fatalf("recent word not rarer: %v", count)
	}
}

func TestPortion_EdgeCases(t *testing.T) {
	if got := NewPicker(nil, rand.New(rand.NewSource(1))).Portion(nil, 6, 5, []string{"aa"}, testParams); got != nil {
		t.Fatalf("no words: %v", got)
	}
	pk := NewPicker([]string{"aaa"}, rand.New(rand.NewSource(1)))
	if got := pk.Portion(nil, 0, 5, nil, testParams); got != nil {
		t.Fatalf("n = 0: %v", got)
	}
	if got := pk.Portion([]string{"aaa"}, 6, 5, nil, testParams); len(got) != 6 {
		t.Fatalf("one word: %v", got)
	}
}

func TestPortion_DoesNotChangeRecent(t *testing.T) {
	recent := make([]string, 2, 10)
	recent[0], recent[1] = "one", "two"
	spare := recent[:3]
	spare[2] = "keep"
	NewPicker([]string{"one", "two", "three"}, rand.New(rand.NewSource(4))).Portion(recent, 6, 10, nil, testParams)
	if spare[2] != "keep" || recent[0] != "one" || recent[1] != "two" {
		t.Fatalf("recent changed: %v", spare)
	}
}

func TestJudge(t *testing.T) {
	for acc, want := range map[float64]Verdict{100: Pass, 96: Pass, 95.9: Hold, 92: Hold, 91.9: Fail, 0: Fail} {
		if got := Judge(acc, testParams); got != want {
			t.Errorf("accuracy %v: %s, want %s", acc, got, want)
		}
	}
}

func rounds(level int, accs ...float64) []Round {
	out := make([]Round, len(accs))
	for i, a := range accs {
		out[i] = Round{Level: level, Accuracy: a}
	}
	return out
}

func TestStanding(t *testing.T) {
	p := testParams
	for _, c := range []struct {
		name   string
		rounds []Round
		want   Place
	}{
		{"no history: LevelStart", nil, Place{Level: 1}},
		{"one pass", rounds(4, 98), Place{Level: 4, Passes: 1}},
		{"two passes and a hold", rounds(4, 98, 94, 97), Place{Level: 4, Passes: 2}},
		{"three passes: up", rounds(4, 98, 99, 97), Place{Level: 5, Moved: 1}},
		{"a fail starts the passes again", rounds(4, 98, 99, 90, 97), Place{Level: 4, Passes: 1}},
		{"one fail", rounds(4, 90), Place{Level: 4, Fails: 1}},
		{"two fails in a row: down", rounds(4, 90, 85), Place{Level: 3, Moved: -1}},
		{"a hold breaks the row", rounds(4, 90, 94, 85), Place{Level: 4, Fails: 1}},
		{"the top level: three passes stay", rounds(10, 98, 98, 98), Place{Level: 10}},
		{"the top level: a fourth pass counts from 0", rounds(10, 98, 98, 98, 98), Place{Level: 10, Passes: 1}},
		{"level 1: two fails stay", rounds(1, 80, 80), Place{Level: 1}},
		{"after a move the same level again (picked): counts from 0", rounds(4, 98, 98, 98, 99), Place{Level: 4, Passes: 1}},
		{"another level before the run does not count",
			append(rounds(3, 98, 98), rounds(4, 99)...), Place{Level: 4, Passes: 1}},
		{"a level out of range counts as the nearest", rounds(14, 98), Place{Level: 10, Passes: 1}},
	} {
		if got := Standing(c.rounds, p); got != c.want {
			t.Errorf("%s: %+v, want %+v", c.name, got, c.want)
		}
	}
}

func TestLevelFromOld(t *testing.T) {
	for old, want := range map[float64]int{0: 1, 0.09: 1, 0.1: 2, 0.43: 5, 0.2: 3, 0.9: 9, 0.91: 10, 1: 10, -1: 1, 2: 10} {
		if got := LevelFromOld(old); got != want {
			t.Errorf("old %v (shown %v): %d, want %d", old, math.Round(old*99)+1, got, want)
		}
	}
}

func TestFreetype_OnlyTheChosenWords(t *testing.T) {
	words := []string{"the", "of", "and", "zebra", "quixotic"}
	pk := NewPicker(words, rand.New(rand.NewSource(7)))
	for _, w := range pk.Freetype(nil, 2000, 3, false, testParams) {
		if w != "the" && w != "of" && w != "and" {
			t.Fatalf("size 3: %q is not one of the 3 most common words", w)
		}
	}
	seen := map[string]bool{}
	for _, w := range pk.Freetype(nil, 2000, 1000, false, testParams) {
		seen[w] = true
	}
	if len(seen) != len(words) {
		t.Errorf("size above the list: saw %d words, want all %d", len(seen), len(words))
	}
	if got := pk.Freetype([]string{"of"}, 5, 0, false, testParams); len(got) != 5 || got[0] != "the" {
		t.Errorf("size 0 means the first word only: %v", got)
	}
	if got := pk.Size(); got != len(words) {
		t.Errorf("Size %d, want %d", got, len(words))
	}
}

func TestFreetype_Long(t *testing.T) {
	words := []string{"the", "zebras", "of", "żółwik", "quixotic", "and"}
	pk := NewPicker(words, rand.New(rand.NewSource(3)))
	seen := map[string]bool{}
	for _, w := range pk.Freetype(nil, 2000, 4, true, testParams) {
		seen[w] = true
	}
	if len(seen) != 2 || !seen["zebras"] || !seen["żółwik"] {
		t.Errorf("long words of the 4 most common: saw %v, want zebras and żółwik", seen)
	}
	if got := pk.Freetype(nil, 50, 1, true, testParams); len(got) != 50 || got[0] != "the" {
		t.Errorf("no long word in the list: %v, want the list's words", got)
	}
}

func TestDraw_OddsAreTheWeights(t *testing.T) {
	pk := NewPicker([]string{"a", "b", "c", "d"}, rand.New(rand.NewSource(8)))
	p := plain()
	recent := []string{"a", "a", "b"}
	count := map[string]int{}
	const n = 60000
	for i := 0; i < n; i++ {
		count[pk.Freetype(recent, 1, 4, false, p)[0]]++
	}
	if count["b"] != 0 {
		t.Fatalf("the last word came again: %v", count)
	}
	total := 0.09 + 1 + 1
	for w, weight := range map[string]float64{"a": 0.09, "c": 1, "d": 1} {
		want := weight / total * n
		if math.Abs(float64(count[w])-want) > 4*math.Sqrt(want) {
			t.Errorf("%q drawn %d times, want about %.0f (%v)", w, count[w], want, count)
		}
	}
}

func TestDraw_FullWeighing(t *testing.T) {
	pk := NewPicker([]string{"a", "b"}, rand.New(rand.NewSource(9)))
	p := plain()
	recent := []string{"a", "a", "a", "a", "a", "a", "a", "a", "a", "b"}
	for i := 0; i < 200; i++ {
		if got := pk.Freetype(recent, 1, 2, false, p)[0]; got != "a" {
			t.Fatalf("only %q is allowed, got %q", "a", got)
		}
	}
	p.RepeatPenalty = 0
	for i := 0; i < 50; i++ {
		if got := pk.Freetype([]string{"a", "b"}, 1, 2, false, p)[0]; got != "a" && got != "b" {
			t.Fatalf("all weights 0: %q is not a word of the list", got)
		}
	}
}

func TestLonger(t *testing.T) {
	got := Longer([]string{"a", "the", "i", "żó", "ż", "of"}, 2)
	if want := []string{"the", "żó", "of"}; !slices.Equal(got, want) {
		t.Errorf("Longer: %v, want %v", got, want)
	}
	if got := Longer([]string{"a"}, 2); len(got) != 0 {
		t.Errorf("only short words: %v", got)
	}
	if got := Longer([]string{"a", "bb"}, 0); len(got) != 2 {
		t.Errorf("min 0 keeps all: %v", got)
	}
}
