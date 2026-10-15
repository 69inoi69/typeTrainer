package freeplay

import (
	"math"
	"math/rand"
	"testing"
)

var testParams = Params{
	PortionWords: 6, AheadPortions: 2, RoundPortions: 5, RecentWords: 20, RepeatPenalty: 0.3,
	TestWPM: 30, TestAccuracy: 97,
}

// With no recent words every word is equally likely: the counts of a large
// sample stay close to the mean (no focus, no frequency preference).
func TestPortion_Uniform(t *testing.T) {
	words := []string{"a", "bb", "ccc", "dddd", "eeeee", "the", "zebra", "quixotic"}
	pk := NewPicker(words, rand.New(rand.NewSource(1)))
	p := testParams
	p.RecentWords = 0 // no repeat penalty: pure uniform draw
	count := map[string]int{}
	const n = 80000
	got := pk.Portion(nil, n, p)
	for _, w := range got {
		count[w]++
	}
	mean := float64(n) / float64(len(words))
	for _, w := range words {
		if d := math.Abs(float64(count[w])-mean) / mean; d > 0.05 {
			t.Errorf("%q: %d draws, mean %.0f (off by %.0f%%)", w, count[w], mean, d*100)
		}
	}
}

// The same word never comes twice in a row, also across the start of a portion.
func TestPortion_NeverTheSameWordTwiceInARow(t *testing.T) {
	pk := NewPicker([]string{"ab", "ba"}, rand.New(rand.NewSource(2)))
	got := pk.Portion([]string{"ab"}, 50, testParams)
	prev := "ab"
	for _, w := range got {
		if w == prev {
			t.Fatalf("%q twice in a row in %v", w, got)
		}
		prev = w
	}
}

// A word used recently is less likely than one not used.
func TestPortion_RecentWordsAreRarer(t *testing.T) {
	words := []string{"one", "two", "three"}
	pk := NewPicker(words, rand.New(rand.NewSource(3)))
	recent := []string{"one", "one", "one", "two"} // "one" used 3 times, last word "two"
	count := map[string]int{}
	for i := 0; i < 3000; i++ {
		count[pk.Portion(recent, 1, testParams)[0]]++
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
	if got := NewPicker(nil, rand.New(rand.NewSource(1))).Portion(nil, 6, testParams); got != nil {
		t.Fatalf("no words: %v", got)
	}
	pk := NewPicker([]string{"aaa"}, rand.New(rand.NewSource(1)))
	if got := pk.Portion(nil, 0, testParams); got != nil {
		t.Fatalf("n = 0: %v", got)
	}
	// one word: a repeat is the only choice and must not hang
	if got := pk.Portion([]string{"aaa"}, 6, testParams); len(got) != 6 {
		t.Fatalf("one word: %v", got)
	}
}

// The test passes at exactly TestWPM and TestAccuracy and fails just below either.
func TestPassed(t *testing.T) {
	for _, c := range []struct {
		wpm, acc float64
		want     bool
	}{
		{30, 97, true}, {45, 99, true}, {29.9, 100, false}, {60, 96.9, false}, {0, 0, false},
	} {
		if got := Passed(c.wpm, c.acc, testParams); got != c.want {
			t.Errorf("Passed(%v, %v) = %v, want %v", c.wpm, c.acc, got, c.want)
		}
	}
}

// The caller's list of recent words is never changed.
func TestPortion_DoesNotChangeRecent(t *testing.T) {
	recent := make([]string, 2, 10)
	recent[0], recent[1] = "one", "two"
	spare := recent[:3]
	spare[2] = "keep"
	NewPicker([]string{"one", "two", "three"}, rand.New(rand.NewSource(4))).Portion(recent, 6, testParams)
	if spare[2] != "keep" || recent[0] != "one" || recent[1] != "two" {
		t.Fatalf("recent changed: %v", spare)
	}
}
