package freeplay

import (
	"math"
	"math/rand"
	"strings"
	"testing"
	"unicode"
)

// testParams mirrors the defaults in internal/config, written out here so
// that changing the config does not silently change what the tests check.
var testParams = Params{
	PortionWords: 6, AheadPortions: 2, RoundPortions: 5, RecentWords: 20, RepeatPenalty: 0.3,
	LevelStart: 0.2, LevelUp: 0.03, LevelDown: 0.06, UpAccuracy: 96, DownAccuracy: 92, SlowShare: 0.85, PartialMin: 3,
	RankMin: 200, CapsFrom: 0.35, CapsMax: 0.3, PunctFrom: 0.55, PunctMax: 0.35, StopShare: 0.4,
}

var marks = []string{",", "."}

// plain: no capitals and no punctuation (level 0), the list of words is all
// within RankMin.
func plain() Params {
	p := testParams
	p.CapsFrom, p.PunctFrom = 1, 1
	return p
}

// With no recent words every word allowed is equally likely: the counts of a
// large sample stay close to the mean.
func TestPortion_Uniform(t *testing.T) {
	words := []string{"a", "bb", "ccc", "dddd", "eeeee", "the", "zebra", "quixotic"}
	pk := NewPicker(words, marks, rand.New(rand.NewSource(1)))
	p := plain()
	p.RecentWords = 0 // no repeat penalty: pure uniform draw
	count := map[string]int{}
	const n = 80000
	for _, w := range pk.Portion(nil, n, 0, p) {
		count[w]++
	}
	mean := float64(n) / float64(len(words))
	for _, w := range words {
		if d := math.Abs(float64(count[w])-mean) / mean; d > 0.05 {
			t.Errorf("%q: %d draws, mean %.0f (off by %.0f%%)", w, count[w], mean, d*100)
		}
	}
}

// The level opens the list: at 0 only the RankMin most common words, at 1
// the whole list, in between a straight line on a log scale
// (200 * (1200/200)^0.5 = 490).
func TestMaxRank(t *testing.T) {
	words := make([]string, 1200)
	for i := range words {
		words[i] = strings.Repeat("a", i%7+1) + string(rune('a'+i%26))
	}
	pk := NewPicker(words, marks, rand.New(rand.NewSource(1)))
	for _, c := range []struct {
		level float64
		want  int
	}{{0, 200}, {0.5, 490}, {0.25, 313}, {1, 1200}, {-1, 200}, {2, 1200}} {
		if got := pk.MaxRank(c.level, testParams); got != c.want {
			t.Errorf("level %v: MaxRank %d, want %d", c.level, got, c.want)
		}
	}
	short := NewPicker([]string{"a", "b"}, marks, rand.New(rand.NewSource(1)))
	if got := short.MaxRank(0, testParams); got != 2 {
		t.Errorf("a list shorter than RankMin: %d, want 2", got)
	}
	// a word beyond the limit never comes at level 0
	idx := map[string]int{}
	for i, w := range words {
		if _, ok := idx[w]; !ok {
			idx[w] = i
		}
	}
	for _, w := range pk.Portion(nil, 500, 0, plain()) {
		if idx[w] >= 200 {
			t.Fatalf("level 0 gave %q at rank %d", w, idx[w])
		}
	}
}

// The layers: nothing below their levels, then capitals, then commas and
// full stops, with a capital after every full stop.
func TestPortion_Layers(t *testing.T) {
	words := []string{"one", "two", "three", "four", "five", "six", "seven", "eight"}
	count := func(level float64) (caps, punct int, got []string) {
		pk := NewPicker(words, marks, rand.New(rand.NewSource(5)))
		got = pk.Portion(nil, 2000, level, testParams)
		for _, w := range got {
			if unicode.IsUpper([]rune(w)[0]) {
				caps++
			}
			if strings.ContainsAny(w, ",.") {
				punct++
			}
		}
		return
	}
	if c, p, _ := count(0.3); c != 0 || p != 0 {
		t.Errorf("level 0.3: %d capitals, %d marks; want none", c, p)
	}
	if c, p, _ := count(0.5); c == 0 || p != 0 {
		t.Errorf("level 0.5: %d capitals, %d marks; want capitals only", c, p)
	}
	c, p, got := count(1)
	// at level 1: CapsMax of the words plus every word after a full stop,
	// PunctMax of the words with a mark
	if share := float64(p) / 2000; math.Abs(share-testParams.PunctMax) > 0.04 {
		t.Errorf("level 1: %.0f%% of the words have a mark, want about %.0f%%", share*100, testParams.PunctMax*100)
	}
	if c < int(2000*testParams.CapsMax) {
		t.Errorf("level 1: only %d capitals", c)
	}
	for i := 1; i < len(got); i++ {
		if strings.HasSuffix(got[i-1], ".") && !unicode.IsUpper([]rune(got[i])[0]) {
			t.Fatalf("%q after %q: a sentence must start with a capital", got[i], got[i-1])
		}
	}
	// a layout without the marks: capitals only
	pk := NewPicker(words, nil, rand.New(rand.NewSource(5)))
	for _, w := range pk.Portion(nil, 500, 1, testParams) {
		if strings.ContainsAny(w, ",.") {
			t.Fatalf("no marks on the layout, but %q", w)
		}
	}
}

// A full stop at the end of the last portion carries over: the next
// portion starts with a capital.
func TestPortion_SentenceCarriesOver(t *testing.T) {
	pk := NewPicker([]string{"one", "two", "three"}, marks, rand.New(rand.NewSource(6)))
	got := pk.Portion([]string{"Two", "one."}, 1, 0, testParams)
	if got[0] != "Two" && got[0] != "Three" {
		t.Fatalf("after a full stop: %q, want a capital (and not the last word again)", got[0])
	}
}

// The same word never comes twice in a row, also across the start of a
// portion and whatever its capital or mark.
func TestPortion_NeverTheSameWordTwiceInARow(t *testing.T) {
	pk := NewPicker([]string{"ab", "ba"}, marks, rand.New(rand.NewSource(2)))
	got := pk.Portion([]string{"Ab,"}, 50, 1, testParams)
	prev := "ab"
	for _, w := range got {
		if Base(w) == prev {
			t.Fatalf("%q twice in a row in %v", w, got)
		}
		prev = Base(w)
	}
}

// A word used recently is less likely than one not used.
func TestPortion_RecentWordsAreRarer(t *testing.T) {
	words := []string{"one", "two", "three"}
	pk := NewPicker(words, marks, rand.New(rand.NewSource(3)))
	recent := []string{"one", "One,", "one.", "two"} // "one" used 3 times, last word "two"
	count := map[string]int{}
	for i := 0; i < 3000; i++ {
		count[Base(pk.Portion(recent, 1, 0, plain())[0])]++
	}
	if count["two"] != 0 {
		t.Fatalf("the last word came again: %v", count)
	}
	if count["one"]*5 > count["three"] { // weight 0.3^3 = 0.027 against 1
		t.Fatalf("recent word not rarer: %v", count)
	}
}

// No words, zero words asked for, and a one-word list: no panic, no endless loop.
func TestPortion_EdgeCases(t *testing.T) {
	if got := NewPicker(nil, marks, rand.New(rand.NewSource(1))).Portion(nil, 6, 0.5, testParams); got != nil {
		t.Fatalf("no words: %v", got)
	}
	pk := NewPicker([]string{"aaa"}, marks, rand.New(rand.NewSource(1)))
	if got := pk.Portion(nil, 0, 0.5, testParams); got != nil {
		t.Fatalf("n = 0: %v", got)
	}
	// one word: a repeat is the only choice and must not hang
	if got := pk.Portion([]string{"aaa"}, 6, 0.5, testParams); len(got) != 6 {
		t.Fatalf("one word: %v", got)
	}
}

// The caller's list of recent words is never changed.
func TestPortion_DoesNotChangeRecent(t *testing.T) {
	recent := make([]string, 2, 10)
	recent[0], recent[1] = "one", "two"
	spare := recent[:3]
	spare[2] = "keep"
	NewPicker([]string{"one", "two", "three"}, marks, rand.New(rand.NewSource(4))).Portion(recent, 6, 1, testParams)
	if spare[2] != "keep" || recent[0] != "one" || recent[1] != "two" {
		t.Fatalf("recent changed: %v", spare)
	}
}

// The thermostat: clean and steady goes up, mistakes go down, clean but
// slowing down holds, and the level stays in [0, 1].
func TestNextLevel(t *testing.T) {
	p := testParams
	for _, c := range []struct {
		name                  string
		level, acc, wpm, pace float64
		want                  float64
	}{
		{"clean and steady: up", 0.5, 98, 60, 60, 0.53},
		{"clean, first portion (no pace yet): up", 0.5, 98, 60, 0, 0.53},
		{"clean but slowing down: holds", 0.5, 98, 45, 60, 0.5},
		{"in between: holds", 0.5, 94, 60, 60, 0.5},
		{"mistakes: down", 0.5, 90, 70, 60, 0.44},
		{"never above 1", 0.99, 100, 60, 60, 1},
		{"never below 0", 0.02, 50, 60, 60, 0},
	} {
		if got := NextLevel(c.level, c.acc, c.wpm, c.pace, p); math.Abs(got-c.want) > 1e-9 {
			t.Errorf("%s: got %.3f, want %.3f", c.name, got, c.want)
		}
	}
}

// Base strips what Climb adds: the capital and the mark.
func TestBase(t *testing.T) {
	for in, want := range map[string]string{"Word,": "word", "word.": "word", "Żółw": "żółw", "word": "word"} {
		if got := Base(in); got != want {
			t.Errorf("Base(%q) = %q, want %q", in, got, want)
		}
	}
}

// Freetype draws only from the size most common words, in lower case and
// without marks; a size out of range is clamped to the list.
func TestFreetype_OnlyTheChosenWords(t *testing.T) {
	words := []string{"the", "of", "and", "zebra", "quixotic"}
	pk := NewPicker(words, marks, rand.New(rand.NewSource(7)))
	for _, w := range pk.Freetype(nil, 2000, 3, testParams) {
		if w != "the" && w != "of" && w != "and" {
			t.Fatalf("size 3: %q is not one of the 3 most common words", w)
		}
	}
	seen := map[string]bool{}
	for _, w := range pk.Freetype(nil, 2000, 1000, testParams) {
		seen[w] = true
	}
	if len(seen) != len(words) {
		t.Errorf("size above the list: saw %d words, want all %d", len(seen), len(words))
	}
	if got := pk.Freetype([]string{"of"}, 5, 0, testParams); len(got) != 5 || got[0] != "the" {
		t.Errorf("size 0 means the first word only: %v", got)
	}
	if got := pk.Size(); got != len(words) {
		t.Errorf("Size %d, want %d", got, len(words))
	}
}

// The quick draw (rejection) and the full weighing give the same odds: on
// a short list full of recent words most draws end in the full weighing,
// on a long list almost none do, and both must match the weights
// RepeatPenalty^uses. Here: "a" used twice (0.09), "b" once (0.3), "c" and
// "d" not at all (1), last word "b" excluded -> a : c : d = 0.09 : 1 : 1.
func TestDraw_OddsAreTheWeights(t *testing.T) {
	pk := NewPicker([]string{"a", "b", "c", "d"}, nil, rand.New(rand.NewSource(8)))
	p := plain()
	recent := []string{"a", "a", "b"}
	count := map[string]int{}
	const n = 60000
	for i := 0; i < n; i++ {
		count[pk.Freetype(recent, 1, 4, p)[0]]++
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

// The full weighing (after the quick draw misses): a short list where the
// only word allowed is rare still gives that word, and weights that are all
// 0 still give a word of the list.
func TestDraw_FullWeighing(t *testing.T) {
	pk := NewPicker([]string{"a", "b"}, nil, rand.New(rand.NewSource(9)))
	p := plain()
	recent := []string{"a", "a", "a", "a", "a", "a", "a", "a", "a", "b"} // a: 0.3^9, b: the last word
	for i := 0; i < 200; i++ {
		if got := pk.Freetype(recent, 1, 2, p)[0]; got != "a" {
			t.Fatalf("only %q is allowed, got %q", "a", got)
		}
	}
	p.RepeatPenalty = 0 // a recent word weighs 0: with "b" last, every weight is 0
	for i := 0; i < 50; i++ {
		if got := pk.Freetype([]string{"a", "b"}, 1, 2, p)[0]; got != "a" && got != "b" {
			t.Fatalf("all weights 0: %q is not a word of the list", got)
		}
	}
}
