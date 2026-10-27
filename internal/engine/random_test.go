package engine

import (
	"strings"
	"testing"
)

func TestRandomPortion(t *testing.T) {
	g := newTestGen(1)
	open := map[string]bool{}
	for _, w := range g.Words(0) {
		open[w] = true
	}
	count := map[string]int{}
	last := ""
	for i := 0; i < 2000; i++ {
		por := g.RandomPortion(0, last, testParams)
		if len(por.Words) != testParams.PortionWords || por.Focus != "" {
			t.Fatalf("portion %+v", por)
		}
		for _, w := range por.Words {
			if !open[w] {
				t.Fatalf("%q uses a locked letter", w)
			}
			if w == last {
				t.Fatalf("%q twice in a row", w)
			}
			count[w]++
			last = w
		}
	}
	n := 2000 * testParams.PortionWords / len(open)
	for w := range open {
		if count[w] < n/3 || count[w] > 3*n {
			t.Errorf("%q came %d times, about %d expected", w, count[w], n)
		}
	}
}

func TestRandomPortion_Edges(t *testing.T) {
	if por := NewGenerator(nil, newRng(1), testParams).RandomPortion(0, "", testParams); len(por.Words) != 0 {
		t.Fatalf("no dictionary: %v", por.Words)
	}
	p := testParams
	p.PortionWords = 0
	if por := newTestGen(1).RandomPortion(0, "", p); len(por.Words) != 0 {
		t.Fatalf("PortionWords 0: %v", por.Words)
	}
	g := NewGenerator([]string{"aaa"}, newRng(1), testParams)
	if por := g.RandomPortion(1, "aaa", testParams); strings.Join(por.Words, " ") != strings.TrimSpace(strings.Repeat("aaa ", testParams.PortionWords)) {
		t.Fatalf("one word: %v", por.Words)
	}
}
