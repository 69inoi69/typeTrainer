package engine

import (
	"testing"
)

// RankWeight on hand-computed values: 1 up to the limit, then halves per step.
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

// Rank is the first place of a word in the list, -1 for an unknown word.
func TestRank(t *testing.T) {
	g := NewGenerator([]string{"the", "to", "the", "and"}, newRng(1), testParams)
	for w, want := range map[string]int{"the": 0, "to": 1, "and": 3, "zebra": -1} {
		if got := g.Rank(w); got != want {
			t.Errorf("Rank(%q) = %d, want %d", w, got, want)
		}
	}
}

// While letters are still locked the limit stays at RankStart, however
// much the user has typed.
func TestMaxRank_FlatUntilEveryLetterIsOpen(t *testing.T) {
	g := NewGenerator(abWords(), newRng(1), rampParams())
	g.SetWordParams(WordParams{RampLetters: 1000})
	want := float64(rampParams().RankStart)
	for _, unlocked := range []int{0, 1, g.Start(), len(g.Order()) - 1} { // 0 = a new user
		for _, typed := range []int{0, 500, 1e6} {
			if got := g.MaxRank(unlocked, typed, rampParams()); !near(got, want) {
				t.Fatalf("unlocked %d, typed %d: MaxRank = %v, want %v", unlocked, typed, got, want)
			}
		}
	}
}

// With every letter open, the limit grows in a straight line from RankStart
// to the whole list over RampLetters letters, never goes down and stops
// at the whole list.
func TestMaxRank_RampAfterTheAlphabet(t *testing.T) {
	p := rampParams()
	g := NewGenerator(abWords(), newRng(1), p)
	g.SetWordParams(WordParams{RampLetters: 1000})
	all := len(g.Order())
	start, end := float64(p.RankStart), float64(len(abWords()))
	for _, c := range []struct {
		typed int
		want  float64
	}{
		{-10, start}, // impossible, but never below the start
		{0, start},
		{500, start + (end-start)/2},
		{1000, end},
		{50000, end},
	} {
		if got := g.MaxRank(all, c.typed, p); !near(got, c.want) {
			t.Errorf("typed %d: MaxRank = %v, want %v", c.typed, got, c.want)
		}
	}
	if got := g.MaxRank(all+5, 1000, p); !near(got, end) {
		t.Errorf("over the alphabet: MaxRank = %v, want %v", got, end)
	}
	prev := -1.0
	for typed := 0; typed <= 1200; typed += 10 {
		m := g.MaxRank(all, typed, p)
		if m < prev {
			t.Fatalf("typed %d: MaxRank %v went down (previous %v)", typed, m, prev)
		}
		prev = m
	}
}

// No ramp set (RampLetters 0): the whole list as soon as every letter is open.
func TestMaxRank_NoRamp(t *testing.T) {
	p := rampParams()
	g := NewGenerator(abWords(), newRng(1), p)
	if got := g.MaxRank(len(g.Order()), 0, p); !near(got, float64(len(abWords()))) {
		t.Fatalf("MaxRank = %v, want the whole list", got)
	}
}

// Every letter open from the first lesson (nothing left to unlock): the
// ramp starts at once, no division by zero; a short list never lowers the
// limit below RankStart.
func TestMaxRank_NothingToUnlock(t *testing.T) {
	p := testParams
	p.StartLetters, p.MinWords = 5, 0
	p.RankStart = 1
	g := NewGenerator([]string{"ab", "ba", "aab"}, newRng(1), p)
	if got := g.MaxRank(0, 0, p); !near(got, 3) {
		t.Fatalf("MaxRank = %v, want 3", got)
	}
	p.RankStart = 200
	if got := g.MaxRank(0, 0, p); !near(got, 200) {
		t.Fatalf("short list: MaxRank = %v, want 200", got)
	}
}

// rampParams: a and b open first, c last (abWords), the limit at rank 50.
func rampParams() Params {
	p := testParams
	p.StartLetters, p.MinWords = 2, 1
	p.RankStart, p.RankStep = 50, 50
	p.MinWordLetters = 0 // the made-up lists below count their one-letter words
	return p
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
func meanRank(g *Generator, unlocked, typed int, p Params) float64 {
	sum, n := 0, 0
	for i := 0; i < 200; i++ {
		for _, w := range g.Portion(nil, unlocked, typed, nil, nil, p).Words {
			sum += g.Rank(w)
			n++
		}
	}
	return float64(sum) / float64(n)
}

// Common words first: while a letter is still locked the words come from
// the top of the list, however much was typed; once every letter is open
// and the ramp is over, the whole list is used.
func TestPortion_CommonWordsFirst(t *testing.T) {
	p := rampParams()
	gen := func(pp Params) *Generator {
		g := NewGenerator(abWords(), newRng(7), pp)
		g.SetWordParams(WordParams{RampLetters: 100})
		return g
	}
	g := gen(p)
	if g.Start() != 2 || len(g.Order()) != 3 {
		t.Fatalf("want a and b open, c locked: start %d, order %v", g.Start(), g.Order())
	}
	early := meanRank(g, 2, 0, p)
	if early > 150 { // the limit is rank 50; a word at 150 already has 1/4 of the weight
		t.Errorf("first lesson: mean rank %v, want the top of the list", early)
	}
	if typedALot := meanRank(gen(p), 2, 1e6, p); typedALot != early {
		t.Errorf("letters still locked: typing more changed the words (mean rank %v, was %v)", typedALot, early)
	}
	// (c has only rare words, so they come in as soon as c opens: the
	// ramp then decides about the rare a/b words)
	start, late := meanRank(gen(p), 3, 0, p), meanRank(gen(p), 3, 100, p)
	if late < 1.5*start {
		t.Errorf("every letter open: mean rank %v before the ramp, %v after it", start, late)
	}
	off := p
	off.RankPenalty = 0
	free := meanRank(gen(off), 2, 0, off)
	if late < 3*early || free < 3*early {
		t.Errorf("mean rank: first lesson %v, after the ramp %v, no penalty %v", early, late, free)
	}
}

// floorWords: a and b words, then three c words far apart down the list
// (the c words are rare: like Russian "ф" among the common words).
func floorWords() []string {
	words := abWords()[:1022]        // without the c words
	pad := func(from int) []string { // 400 ten-letter a/b words
		var out []string
		for m := from; m < from+400; m++ {
			w := make([]byte, 10)
			for i := range w {
				w[i] = "ab"[m>>i&1]
			}
			out = append(out, string(w))
		}
		return out
	}
	words = append(words, "abc")
	words = append(words, pad(0)...)
	words = append(words, "cab")
	words = append(words, pad(400)...)
	return append(words, "bca")
}

// letterMaxRank: never below the rank of the letter's FloorWords-th word
// in the whole list (its last word if it has fewer), MaxRank when the floor
// is off, and nothing changes for a letter with many common words.
func TestLetterMaxRank(t *testing.T) {
	p := rampParams()
	g := NewGenerator(floorWords(), newRng(1), p)
	all := len(g.Order())
	for _, c := range []struct {
		floor int
		want  float64
	}{
		{0, 50},    // off: MaxRank
		{1, 1022},  // the first c word ("abc")
		{2, 1423},  // the second ("cab")
		{3, 1824},  // all three
		{10, 1824}, // fewer words than the floor: all of them
	} {
		g.SetWordParams(WordParams{FloorWords: c.floor, RampLetters: 1e9})
		pl := g.newPool(nil, all, 0, p)
		if got := pl.letterMaxRank("c"); !near(got, c.want) {
			t.Errorf("floor %d: %v, want %v", c.floor, got, c.want)
		}
		if got := pl.letterMaxRank("a"); !near(got, 50) { // a has many common words
			t.Errorf("floor %d: letter a got %v, want 50", c.floor, got)
		}
		if got := pl.letterMaxRank("z"); !near(got, 50) { // not in the list at all
			t.Errorf("floor %d, unknown letter: %v, want 50", c.floor, got)
		}
	}
}

// The floor is counted in the whole list, not among the open words: in a
// first lesson with few open words the limit stays at RankStart for a
// letter that is common in the whole list.
func TestLetterMaxRank_FirstLesson(t *testing.T) {
	p := rampParams()
	g := NewGenerator(floorWords(), newRng(1), p)
	g.SetWordParams(WordParams{FloorWords: 10, RampLetters: 1e9})
	pl := g.newPool(nil, 1, 0, p) // one letter open: 9 words of it
	if got := pl.letterMaxRank(g.Order()[0]); !near(got, 50) {
		t.Fatalf("first lesson: %v, want 50", got)
	}
}

// With the floor, a rare letter's few words come about equally often; without
// it the most common of them takes almost every slot.
func TestPickWord_FloorSpreadsARareLetter(t *testing.T) {
	p := rampParams()
	share := func(floor int) map[string]float64 {
		g := NewGenerator(floorWords(), newRng(1), p)
		g.SetWordParams(WordParams{FloorWords: floor, RampLetters: 1e9})
		pl := g.newPool(nil, len(g.Order()), 0, p)
		uses := make([]int, len(pl.words))
		rng := newRng(5)
		got := map[string]float64{}
		const n = 3000
		for i := 0; i < n; i++ {
			got[pl.words[pl.pickWord("c", uses, p, rng.Float64())]] += 1.0 / n
		}
		return got
	}
	off, on := share(0), share(3)
	if off["abc"] < 0.95 {
		t.Errorf("no floor: the most common c word got %.2f, want almost all", off["abc"])
	}
	for _, w := range []string{"abc", "cab", "bca"} {
		if on[w] < 0.25 {
			t.Errorf("floor 3: %q got %.2f, want about a third", w, on[w])
		}
	}
}

// Only rare words in the first lesson: the lesson still works.
func TestPortion_NoCommonWords(t *testing.T) {
	p := testParams
	p.StartLetters, p.MinWords = 2, 1
	p.RankStart, p.RankStep = 1, 1
	words := append([]string{"xyz", "zyx", "yxz", "xzy", "zxy", "yzx", "xxz"}, "ab", "ba", "aab")
	g := NewGenerator(words, newRng(3), p)
	por := g.Portion(nil, 0, 0, nil, nil, p)
	if len(por.Words) != p.PortionWords {
		t.Fatalf("got %v, want %d words", por.Words, p.PortionWords)
	}
}
