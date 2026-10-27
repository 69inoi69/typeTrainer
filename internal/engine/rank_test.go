package engine

import (
	"testing"
)

func TestRankWeight(t *testing.T) {
	p := testParams
	for _, c := range []struct {
		rank int
		max  float64
		want float64
	}{
		{0, 200, 1},
		{200, 200, 1},
		{400, 200, 0.5},
		{800, 200, 0.125},
		{300, 200, 0.7071067811865476},
		{-1, 200, 1},
	} {
		if got := RankWeight(c.rank, c.max, p); !near(got, c.want) {
			t.Errorf("RankWeight(%d, %v) = %v, want %v", c.rank, c.max, got, c.want)
		}
	}
}

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

func TestMaxRank_FlatUntilEveryLetterIsOpen(t *testing.T) {
	g := NewGenerator(abWords(), newRng(1), rampParams())
	g.SetWordParams(WordParams{RampLetters: 1000})
	want := float64(rampParams().RankStart)
	for _, unlocked := range []int{0, 1, g.Start(), len(g.Order()) - 1} {
		for _, typed := range []int{0, 500, 1e6} {
			if got := g.MaxRank(unlocked, typed, rampParams()); !near(got, want) {
				t.Fatalf("unlocked %d, typed %d: MaxRank = %v, want %v", unlocked, typed, got, want)
			}
		}
	}
}

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
		{-10, start},
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

func TestMaxRank_NoRamp(t *testing.T) {
	p := rampParams()
	g := NewGenerator(abWords(), newRng(1), p)
	if got := g.MaxRank(len(g.Order()), 0, p); !near(got, float64(len(abWords()))) {
		t.Fatalf("MaxRank = %v, want the whole list", got)
	}
}

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

func rampParams() Params {
	p := testParams
	p.StartLetters, p.MinWords = 2, 1
	p.RankStart, p.RankStep = 50, 50
	p.MinWordLetters = 0
	return p
}

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
	if early > 150 {
		t.Errorf("first lesson: mean rank %v, want the top of the list", early)
	}
	if typedALot := meanRank(gen(p), 2, 1e6, p); typedALot != early {
		t.Errorf("letters still locked: typing more changed the words (mean rank %v, was %v)", typedALot, early)
	}
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

func floorWords() []string {
	words := abWords()[:1022]
	pad := func(from int) []string {
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

func TestLetterMaxRank(t *testing.T) {
	p := rampParams()
	g := NewGenerator(floorWords(), newRng(1), p)
	all := len(g.Order())
	for _, c := range []struct {
		floor int
		want  float64
	}{
		{0, 50},
		{1, 1022},
		{2, 1423},
		{3, 1824},
		{10, 1824},
	} {
		g.SetWordParams(WordParams{FloorWords: c.floor, RampLetters: 1e9})
		pl := g.newPool(nil, all, 0, p)
		if got := pl.letterMaxRank("c"); !near(got, c.want) {
			t.Errorf("floor %d: %v, want %v", c.floor, got, c.want)
		}
		if got := pl.letterMaxRank("a"); !near(got, 50) {
			t.Errorf("floor %d: letter a got %v, want 50", c.floor, got)
		}
		if got := pl.letterMaxRank("z"); !near(got, 50) {
			t.Errorf("floor %d, unknown letter: %v, want 50", c.floor, got)
		}
	}
}

func TestLetterMaxRank_FirstLesson(t *testing.T) {
	p := rampParams()
	g := NewGenerator(floorWords(), newRng(1), p)
	g.SetWordParams(WordParams{FloorWords: 10, RampLetters: 1e9})
	pl := g.newPool(nil, 1, 0, p)
	if got := pl.letterMaxRank(g.Order()[0]); !near(got, 50) {
		t.Fatalf("first lesson: %v, want 50", got)
	}
}

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
