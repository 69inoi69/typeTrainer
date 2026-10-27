// Climb's weak letter pairs.

package freeplay

import (
	"cmp"
	"slices"
	"unicode"
)

type Key struct {
	Char   string
	Errors int
	Ms     float64
}

type Pair struct {
	Pair  string  `json:"pair"`
	Cost  float64 `json:"cost"`
	Count int     `json:"count"`
}

func WeakPairs(rounds [][]Key, p Params) []Pair {
	type sum struct {
		ms float64
		n  int
	}
	pairs := map[string]*sum{}
	all := sum{}
	for _, keys := range rounds {
		for i := 1; i < len(keys); i++ {
			a, b := []rune(keys[i-1].Char), []rune(keys[i].Char)
			if len(a) != 1 || len(b) != 1 || !isLower(a[0]) || !isLower(b[0]) {
				continue
			}
			var ms float64
			switch {
			case keys[i].Errors > 0:
				ms = p.WeakMissMs
			case keys[i].Ms > 0:
				ms = keys[i].Ms
			default:
				continue
			}
			k := string(a) + string(b)
			if pairs[k] == nil {
				pairs[k] = &sum{}
			}
			pairs[k].ms += ms
			pairs[k].n++
			all.ms += ms
			all.n++
		}
	}
	if all.n == 0 {
		return nil
	}
	mean := all.ms / float64(all.n)
	var out []Pair
	for k, s := range pairs {
		if s.n < p.WeakMinSamples {
			continue
		}
		if cost := s.ms / float64(s.n); cost > mean {
			out = append(out, Pair{Pair: k, Cost: cost, Count: s.n})
		}
	}
	slices.SortFunc(out, func(x, y Pair) int {
		return cmp.Or(cmp.Compare(y.Cost, x.Cost), cmp.Compare(x.Pair, y.Pair))
	})
	return out[:min(len(out), max(p.WeakPairs, 0))]
}

func isLower(r rune) bool { return unicode.IsLetter(r) && unicode.IsLower(r) }
