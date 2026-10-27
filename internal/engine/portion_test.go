package engine

import (
	"math/rand"
	"strings"
	"testing"
)

func newRng(seed int64) *rand.Rand { return rand.New(rand.NewSource(seed)) }

func TestPortion_NewUserOpenLettersOnly(t *testing.T) {
	g := newTestGen(2)
	por := g.Portion(nil, 0, 0, nil, nil, testParams)
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

func TestPortion_EveryWordHasTheFocus(t *testing.T) {
	g := newTestGen(5)
	all := len(g.Order())
	for i := 0; i < 100; i++ {
		por := g.Portion(nil, all, 0, nil, nil, testParams)
		if len(g.newPool(nil, all, 0, testParams).byLetter[por.Focus]) < 3 {
			continue
		}
		for _, w := range por.Words {
			if !strings.Contains(w, por.Focus) {
				t.Fatalf("focus %q, but %q in %v", por.Focus, w, por.Words)
			}
		}
	}
}

func TestPortion_NoWordTwiceInARow(t *testing.T) {
	g := newTestGen(3)
	var stream []string
	for i := 0; i < 100; i++ {
		var retry []string
		if len(stream) > 0 {
			retry = stream[len(stream)-1:]
		}
		stream = append(stream, g.Portion(nil, 0, 0, stream, retry, testParams).Words...)
	}
	for j := 1; j < len(stream); j++ {
		if stream[j] == stream[j-1] {
			t.Fatalf("repeated word %q at %d", stream[j], j)
		}
	}
}

func TestPortion_RetryWordsComeBack(t *testing.T) {
	g := newTestGen(6)
	all := len(g.Order())
	retry := []string{"water", "people", "sentence"}
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
	por = g.Portion(nil, 0, 0, nil, []string{"zzz", "water"}, testParams)
	for _, w := range por.Words {
		if w == "zzz" || w == "water" {
			t.Fatalf("not allowed word came back: %v", por.Words)
		}
	}
}

func TestPortion_RecentWindow(t *testing.T) {
	p := testParams
	p.PortionWords = 1
	p.MaxRepeats = 0
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
	used := []string{"aab", "aab", "aab", "ab"}
	old := append(append([]string{}, used...), filler("ba", p.RecentWords)...)
	if a, b := count(used), count(old); a >= b {
		t.Fatalf("recent uses should lower the chance: %d (recent) vs %d (old)", a, b)
	}
}

func filler(w string, n int) []string {
	out := make([]string, n)
	for i := range out {
		if i%2 == 0 {
			out[i] = w
		} else {
			out[i] = "ab"
		}
	}
	return out
}

func TestPortion_MaxRepeatsInARound(t *testing.T) {
	p := testParams
	p.StartLetters, p.MinWords = 3, 1
	words := append(abWords()[2:62], "cab", "abc")
	good := KeyStat{Count: 100, ErrEMA: 0.01, TimeEMA: 300, TimedCount: 100, Held: true}
	stats := map[string]KeyStat{"a": good, "b": good, "c": {}}
	for seed := int64(0); seed < 50; seed++ {
		g := NewGenerator(words, newRng(seed), p)
		var round []string
		for i := 0; i < p.RoundPortions; i++ {
			por := g.Portion(stats, 3, 0, round, nil, p)
			if por.Focus != "c" {
				t.Fatalf("focus %q, want c", por.Focus)
			}
			round = append(round, por.Words...)
		}
		uses := map[string]int{}
		for _, w := range round {
			uses[w]++
			if uses[w] > p.MaxRepeats {
				t.Fatalf("seed %d: %q %d times in %v", seed, w, uses[w], round)
			}
		}
		if uses["cab"]+uses["abc"] != 2*p.MaxRepeats {
			t.Fatalf("seed %d: the focus words should fill their cap first: %v", seed, round)
		}
	}
}

func TestNewGenerator_MinWordLetters(t *testing.T) {
	words := strings.Fields("a i as is sa si ass")
	p := testParams
	p.StartLetters, p.MinWords = 1, 0
	g := NewGenerator(words, newRng(1), p)
	for _, w := range g.Words(len(g.Order())) {
		if len(w) < p.MinWordLetters {
			t.Fatalf("short word %q in %v", w, g.Words(len(g.Order())))
		}
	}
	if g.Rank("a") != -1 || g.Rank("as") != 0 {
		t.Fatalf("ranks: a %d (want -1), as %d (want 0)", g.Rank("a"), g.Rank("as"))
	}
	p.MinWordLetters = 0
	if g = NewGenerator(words, newRng(1), p); len(g.Words(len(g.Order()))) != len(words) {
		t.Fatalf("MinWordLetters 0 must keep every word: %v", g.Words(len(g.Order())))
	}
}

func TestPortion_ZeroAndEmpty(t *testing.T) {
	p := testParams
	p.PortionWords = 0
	if por := newTestGen(1).Portion(nil, 0, 0, nil, nil, p); len(por.Words) != 0 {
		t.Fatalf("PortionWords = 0: got %v", por.Words)
	}
	p.StartLetters, p.MinWords = 1, 0
	g := NewGenerator(nil, newRng(1), p)
	if por := g.Portion(nil, 0, 0, nil, nil, p); len(por.Words) != 0 {
		t.Fatalf("no words: got %v", por.Words)
	}
	g = NewGenerator([]string{"aaa"}, newRng(1), p)
	if por := g.Portion(nil, 1, 0, []string{"aaa"}, []string{"aaa"}, testParams); len(por.Words) != testParams.PortionWords {
		t.Fatalf("one word: got %v", por.Words)
	}
}
