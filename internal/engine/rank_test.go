package engine

import (
	"testing"
)

func TestRankWeight(t *testing.T) {
	p := testParams // RankStep 200, RankPenalty 0.5
	for _, c := range []struct {
		rank int
		max  float64
		want float64
	}{
		{0, 200, 1},                    // the most common word
		{200, 200, 1},                  // exactly the limit: no penalty
		{400, 200, 0.5},                // one step over: half
		{800, 200, 0.125},              // three steps over: 0.5^3
		{300, 200, 0.7071067811865476}, // half a step over: 0.5^0.5 (the fade is smooth)
		{-1, 200, 1},                   // a word that is not in the list
	} {
		if got := RankWeight(c.rank, c.max, p); !near(got, c.want) {
			t.Errorf("RankWeight(%d, %v) = %v, want %v", c.rank, c.max, got, c.want)
		}
	}
}

// The weight falls further down the list and never reaches 0.
func TestRankWeight_MonotonicNeverZero(t *testing.T) {
	prev := 2.0
	for r := 0; r <= 20000; r += 100 {
		w := RankWeight(r, 200, testParams)
		if w > prev || w <= 0 {
			t.Fatalf("rank %d: weight %v (previous %v)", r, w, prev)
		}
		prev = w
	}
}

// Zero, 1 or more, or a negative penalty, and a step <= 0 mean "no
// penalty", so params without the frequency fields behave as before.
func TestRankWeight_Off(t *testing.T) {
	for _, c := range []struct{ pen, step float64 }{{0, 200}, {1, 200}, {1.5, 200}, {-0.5, 200}, {0.5, 0}, {0.5, -1}} {
		p := testParams
		p.RankPenalty, p.RankStep = c.pen, c.step
		if got := RankWeight(1999, 200, p); got != 1 {
			t.Errorf("penalty %v, step %v: got %v, want 1", c.pen, c.step, got)
		}
	}
}

func TestRank(t *testing.T) {
	g := NewGenerator([]string{"the", "to", "the", "and"}, newRng(1), testParams)
	for w, want := range map[string]int{"the": 0, "to": 1, "and": 3, "zebra": -1} {
		if got := g.Rank(w); got != want {
			t.Errorf("Rank(%q) = %d, want %d", w, got, want)
		}
	}
}

// The limit goes from RankStart in the first lesson to the whole list with
// every letter open, and never goes down.
func TestMaxRank_GrowsWithUnlockedLetters(t *testing.T) {
	g := newTestGen(1)
	start, all := g.Start(), len(g.Order())
	if got := g.MaxRank(start, testParams); !near(got, float64(testParams.RankStart)) {
		t.Fatalf("first lesson: MaxRank = %v, want %v", got, testParams.RankStart)
	}
	if got := g.MaxRank(0, testParams); !near(got, float64(testParams.RankStart)) { // new user
		t.Fatalf("unlocked 0: MaxRank = %v, want %v", got, testParams.RankStart)
	}
	end := float64(max(len(testWords), testParams.RankStart)) // a short list never lowers the limit
	if got := g.MaxRank(all, testParams); !near(got, end) {
		t.Fatalf("all letters: MaxRank = %v, want %v", got, end)
	}
	if got := g.MaxRank(all+5, testParams); !near(got, end) {
		t.Fatalf("over the alphabet: MaxRank = %v", got)
	}
	prev := -1.0
	for n := start; n <= all; n++ {
		m := g.MaxRank(n, testParams)
		if m < prev {
			t.Fatalf("unlocked %d: MaxRank %v went down (previous %v)", n, m, prev)
		}
		prev = m
	}
}

// Every letter open from the first lesson (nothing left to unlock): the
// whole list is allowed, no division by zero.
func TestMaxRank_NothingToUnlock(t *testing.T) {
	p := testParams
	p.StartLetters, p.MinWords = 5, 0
	p.RankStart = 1
	g := NewGenerator([]string{"ab", "ba", "aab"}, newRng(1), p)
	if got := g.MaxRank(0, p); !near(got, 3) {
		t.Fatalf("MaxRank = %v, want 3", got)
	}
}

// abWords: every word of a and b with 1..9 letters (1022 words), then a few
// rare words with c, so c is the last letter to open.
func abWords() []string {
	var out []string
	for n := 1; n <= 9; n++ {
		for m := 0; m < 1<<n; m++ {
			w := make([]byte, n)
			for i := range w {
				w[i] = "ab"[m>>i&1]
			}
			out = append(out, string(w))
		}
	}
	return append(out, "abc", "cab", "bca")
}

// meanRank of the words in many portions.
func meanRank(g *Generator, unlocked int, p Params) float64 {
	sum, n := 0, 0
	for i := 0; i < 200; i++ {
		for _, w := range g.Portion(nil, unlocked, nil, nil, p).Words {
			sum += g.Rank(w)
			n++
		}
	}
	return float64(sum) / float64(n)
}

// Common words first: in the first lesson the words come from the top of
// the list; with every letter open the whole list is used.
func TestPortion_CommonWordsFirst(t *testing.T) {
	p := testParams
	p.StartLetters, p.MinWords = 2, 1
	p.RankStart, p.RankStep = 50, 50
	g := NewGenerator(abWords(), newRng(7), p)
	if g.Start() != 2 || len(g.Order()) != 3 {
		t.Fatalf("want a and b open, c locked: start %d, order %v", g.Start(), g.Order())
	}
	early, late := meanRank(g, 2, p), meanRank(g, 3, p)
	off := p
	off.RankPenalty = 0
	free := meanRank(NewGenerator(abWords(), newRng(7), off), 2, off)
	if early > 150 { // the limit is rank 50; a word at 150 already has 1/4 of the weight
		t.Errorf("first lesson: mean rank %v, want the top of the list", early)
	}
	if late < 3*early || free < 3*early {
		t.Errorf("mean rank: first lesson %v, all letters %v, no penalty %v", early, late, free)
	}
}

// Only rare words in the first lesson: the lesson still works.
func TestPortion_NoCommonWords(t *testing.T) {
	p := testParams
	p.StartLetters, p.MinWords = 2, 1
	p.RankStart, p.RankStep = 1, 1
	words := append([]string{"xyz", "zyx", "yxz", "xzy", "zxy", "yzx", "xxz"}, "ab", "ba", "aab")
	g := NewGenerator(words, newRng(3), p)
	por := g.Portion(nil, 0, nil, nil, p)
	if len(por.Words) != p.PortionWords {
		t.Fatalf("got %v, want %d words", por.Words, p.PortionWords)
	}
}
