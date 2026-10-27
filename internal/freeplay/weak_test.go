package freeplay

import (
	"math/rand"
	"strings"
	"testing"
)

func keysOf(text string, ms, slowMs float64, slow, bad map[int]bool) []Key {
	var out []Key
	for i, r := range []rune(text) {
		k := Key{Char: string(r), Ms: ms}
		if slow[i] {
			k.Ms = slowMs
		}
		if bad[i] {
			k.Errors = 1
		}
		out = append(out, k)
	}
	return out
}

func slowAt(text, pair string) map[int]bool {
	at := map[int]bool{}
	for i := 0; ; {
		j := strings.Index(text[i:], pair)
		if j < 0 {
			return at
		}
		at[i+j+1] = true
		i += j + 1
	}
}

func TestWeakPairs_NoData(t *testing.T) {
	if got := WeakPairs(nil, testParams); got != nil {
		t.Fatalf("no rounds: %v", got)
	}
	if got := WeakPairs([][]Key{keysOf("a b c", 150, 0, nil, nil)}, testParams); got != nil {
		t.Fatalf("no pairs: %v", got)
	}
}

func TestWeakPairs_EvenTypistHasNone(t *testing.T) {
	text := strings.Repeat("the quick brown fox jumps ", 20)
	if got := WeakPairs([][]Key{keysOf(text, 150, 0, nil, nil)}, testParams); len(got) != 0 {
		t.Fatalf("even typist: %v", got)
	}
}

func TestWeakPairs_SlowPairFirst(t *testing.T) {
	text := strings.Repeat("the quick brown fox jumps ", 20)
	round := keysOf(text, 150, 400, slowAt(text, "ck"), nil)
	got := WeakPairs([][]Key{round}, testParams)
	if len(got) == 0 || got[0].Pair != "ck" || got[0].Count != 20 || got[0].Cost != 400 {
		t.Fatalf("slow ck: %v", got)
	}
	few := strings.Repeat("the quick brown fox ", 2) + strings.Repeat("the brown fox ", 20)
	if got := WeakPairs([][]Key{keysOf(few, 150, 400, slowAt(few, "ck"), nil)}, testParams); len(got) != 0 {
		t.Fatalf("a pair seen twice is noise: %v", got)
	}
}

func TestWeakPairs_MistakesAndUntimed(t *testing.T) {
	text := strings.Repeat("the brown fox jumps ", 20)
	round := keysOf(text, 150, 0, nil, slowAt(text, "ox"))
	if got := WeakPairs([][]Key{round}, testParams); len(got) == 0 || got[0].Pair != "ox" || got[0].Cost != testParams.WeakMissMs {
		t.Fatalf("inaccurate ox: %v", got)
	}
	untimed := keysOf(text, 150, 0, slowAt(text, "ox"), nil)
	if got := WeakPairs([][]Key{untimed}, testParams); len(got) != 0 {
		t.Fatalf("untimed presses must not count: %v", got)
	}
}

func TestWeakPairs_OnlyLowerCaseLetters(t *testing.T) {
	text := strings.Repeat("The fox, ", 30)
	slow := map[int]bool{}
	for i, r := range text {
		if r == 'h' || r == ',' || r == 'f' {
			slow[i] = true
		}
	}
	for _, p := range WeakPairs([][]Key{keysOf(text, 150, 900, slow, nil)}, testParams) {
		t.Errorf("no pair of two lower-case letters is slow here, got %v", p)
	}
}

func TestWeakPairs_TopFew(t *testing.T) {
	text := strings.Repeat("ab cd ef gh ij kl ", 20)
	ms := map[string]float64{"ab": 300, "cd": 500, "ef": 400, "gh": 350}
	var rounds [][]Key
	round := keysOf(text, 150, 0, nil, nil)
	for i := 1; i < len(round); i++ {
		if v, ok := ms[round[i-1].Char+round[i].Char]; ok {
			round[i].Ms = v
		}
	}
	rounds = append(rounds, round[:len(round)/2], round[len(round)/2:])
	got := WeakPairs(rounds, testParams)
	if len(got) != 3 || got[0].Pair != "cd" || got[1].Pair != "ef" || got[2].Pair != "gh" {
		t.Fatalf("top three: %v", got)
	}
}

func TestPortion_WeakShare(t *testing.T) {
	words := make([]string, 200)
	for i := range words {
		words[i] = "w" + strings.Repeat("a", i%5+1) + string(rune('a'+i%26)) + string(rune('a'+i/26))
	}
	words[7], words[50], words[99], words[120], words[150] = "xqz", "axqa", "bxqb", "cxqc", "dxqd"
	for i := 0; i < 10; i++ {
		words[160+i] += "xq"
	}
	pk := NewPicker(words, rand.New(rand.NewSource(3)))
	p := plain()
	with := func(got []string) int {
		n := 0
		for _, w := range got {
			if strings.Contains(w, "xq") {
				n++
			}
		}
		return n
	}
	got := pk.Portion(nil, 4000, 1, []string{"xq"}, p)
	if share := float64(with(got)) / 4000; share < p.WeakShare || share > p.WeakShare+0.1 {
		t.Fatalf("share of words with the weak pair: %.2f, want about %.2f", share, p.WeakShare)
	}
	p.WeakMinWords = 100
	got = pk.Portion(nil, 4000, 1, []string{"xq"}, p)
	if share := float64(with(got)) / 4000; share > 0.15 {
		t.Fatalf("too few words with the pair: share %.2f, want the plain ~0.08", share)
	}
}
