package engine

import (
	"math/rand"
	"strings"
	"testing"
)

// newRng is a seeded random source, so every test run is the same.
func newRng(seed int64) *rand.Rand { return rand.New(rand.NewSource(seed)) }

// A new user's portion: PortionWords words of open letters, an open focus.
func TestPortion_NewUserOpenLettersOnly(t *testing.T) {
	g := newTestGen(2)
	por := g.Portion(nil, 0, 0, nil, nil, testParams) // no stats, nothing stored yet
	if len(por.Words) != testParams.PortionWords {
		t.Fatalf("got %d words, want %d", len(por.Words), testParams.PortionWords)
	}
	open := strings.Join(por.Unlocked, "")
	for _, w := range por.Words {
		for _, r := range w {
			if !strings.ContainsRune(open, r) {
				t.Fatalf("locked letter %q in %q", r, w)
			}
		}
	}
	if !strings.Contains(open, por.Focus) || por.Focus == "" {
		t.Fatalf("focus %q is not an open letter", por.Focus)
	}
	if len(por.Unlocked)+len(por.Locked) != len(g.Order()) {
		t.Fatal("unlocked + locked must cover every letter")
	}
}

// One focus letter per portion: every word trains it.
func TestPortion_EveryWordHasTheFocus(t *testing.T) {
	g := newTestGen(5)
	all := len(g.Order())
	for i := 0; i < 100; i++ {
		por := g.Portion(nil, all, 0, nil, nil, testParams)
		if len(g.newPool(nil, all, 0, testParams).byLetter[por.Focus]) < 3 {
			continue // a letter with very few words may borrow others
		}
		for _, w := range por.Words {
			if !strings.Contains(w, por.Focus) {
				t.Fatalf("focus %q, but %q in %v", por.Focus, w, por.Words)
			}
		}
	}
}

// No word twice in a row across portions, even when the last word is a retry.
func TestPortion_NoWordTwiceInARow(t *testing.T) {
	g := newTestGen(3)
	var stream []string
	for i := 0; i < 100; i++ {
		var retry []string
		if len(stream) > 0 {
			retry = stream[len(stream)-1:] // the very last word comes back
		}
		stream = append(stream, g.Portion(nil, 0, 0, stream, retry, testParams).Words...)
	}
	for j := 1; j < len(stream); j++ {
		if stream[j] == stream[j-1] {
			t.Fatalf("repeated word %q at %d", stream[j], j)
		}
	}
}

// Up to RetryWords mistyped words come back, but never one with a locked
// letter or one that is not in the list.
func TestPortion_RetryWordsComeBack(t *testing.T) {
	g := newTestGen(6)
	all := len(g.Order())
	retry := []string{"water", "people", "sentence"} // three, but RetryWords = 2
	por := g.Portion(nil, all, 0, nil, retry, testParams)
	got := 0
	for _, w := range por.Words {
		if w == "water" || w == "people" {
			got++
		}
		if w == "sentence" {
			t.Fatalf("more than RetryWords retries: %v", por.Words)
		}
	}
	if got != 2 {
		t.Fatalf("want water and people in %v", por.Words)
	}
	// a word with a locked letter (or not in the list) never comes back
	por = g.Portion(nil, 0, 0, nil, []string{"zzz", "water"}, testParams) // w is locked at the start
	for _, w := range por.Words {
		if w == "zzz" || w == "water" {
			t.Fatalf("not allowed word came back: %v", por.Words)
		}
	}
}

// RepeatPenalty looks only at the last RecentWords words.
func TestPortion_RecentWindow(t *testing.T) {
	p := testParams
	p.PortionWords = 1
	words := strings.Fields("ab ba aab")
	count := func(recent []string) int {
		hit := 0
		for seed := int64(0); seed < 400; seed++ {
			g := NewGenerator(words, newRng(seed), p)
			if g.Portion(nil, 2, 0, recent, nil, p).Words[0] == "aab" {
				hit++
			}
		}
		return hit
	}
	used := []string{"aab", "aab", "aab", "ab"}                 // aab used 3 times recently
	old := append(append([]string{}, used...), make20("ba")...) // the same, but long ago
	if a, b := count(used), count(old); a >= b {
		t.Fatalf("recent uses should lower the chance: %d (recent) vs %d (old)", a, b)
	}
}

func make20(w string) []string {
	out := make([]string, 20)
	for i := range out {
		if i%2 == 0 {
			out[i] = w
		} else {
			out[i] = "ab"
		}
	}
	return out
}

// No words per portion, no dictionary, or one word: no panic, no endless loop.
func TestPortion_ZeroAndEmpty(t *testing.T) {
	p := testParams
	p.PortionWords = 0
	if por := newTestGen(1).Portion(nil, 0, 0, nil, nil, p); len(por.Words) != 0 {
		t.Fatalf("PortionWords = 0: got %v", por.Words)
	}
	p.StartLetters, p.MinWords = 1, 0
	g := NewGenerator(nil, newRng(1), p) // no dictionary at all
	if por := g.Portion(nil, 0, 0, nil, nil, p); len(por.Words) != 0 {
		t.Fatalf("no words: got %v", por.Words)
	}
	// a one-word dictionary: a repeat is the only choice, and must not hang
	g = NewGenerator([]string{"aaa"}, newRng(1), p)
	if por := g.Portion(nil, 1, 0, []string{"aaa"}, []string{"aaa"}, testParams); len(por.Words) != testParams.PortionWords {
		t.Fatalf("one word: got %v", por.Words)
	}
}
