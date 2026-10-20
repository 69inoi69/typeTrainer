// Weak pairs: what Climb knows about the typist's own hands.
//
// A typist who can already type is rarely slow on a letter; they are slow
// on a movement: "th" may fly while "ck" or "ou" stumbles. So Climb looks
// at pairs of letters (bigrams): the press of the second letter, timed
// from the press of the first, is the movement from one key to the other.
// WeakPairs finds the pairs that cost the typist most in their last Climb
// rounds, and Portion (freeplay.go) puts words with them into a share of
// the text (docs/ALGORITHM.md section 13.1).
//
// The data is the raw record every Climb round already keeps
// (storage.Session.Keys). Nothing is stored apart and nothing comes from
// learning: the pairs are worked out again from the history at every call.
// To add another kind of weakness (a slow capital, a slow comma): count it
// here from the same samples and give Portion a pool for it.

package freeplay

import (
	"cmp"
	"slices"
	"unicode"
)

// Key is one press of a round's raw record, as storage.Session.Keys keeps
// it (engine.Sample); the api package copies the fields, so this package
// still imports nothing from the project.
type Key struct {
	Char   string
	Errors int     // wrong keys pressed at this place (0 = clean)
	Ms     float64 // time since the previous press; 0 = not measured
}

// Pair is one letter pair and what it costs the typist.
type Pair struct {
	Pair  string  `json:"pair"`  // two lower-case letters, as typed one after the other
	Cost  float64 `json:"cost"`  // average ms per press, a mistake counted as WeakMissMs
	Count int     `json:"count"` // presses it is measured on
}

// WeakPairs returns the WeakPairs pairs that cost most, the most costly
// first, from the raw keys of the last rounds (rounds: newest or oldest
// first, it does not matter):
//
//	cost(pair) = (sum of clean timed ms + mistakes * WeakMissMs) / (clean timed presses + mistakes)
//
// A pair counts only when it was pressed at least WeakMinSamples times
// (fewer is noise) and costs more than all pairs together on average (a
// typist with no slow pair has none). A pair is two lower-case letters
// typed one after the other: a space, a mark or a capital (Shift adds its
// own time) breaks it. A press after a Backspace or a pause has no time
// (Ms 0) and counts only when it was a mistake.
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
				continue // clean, but not timed
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
	// the most costly first; equal costs by name, so the answer is the same every time
	slices.SortFunc(out, func(x, y Pair) int {
		return cmp.Or(cmp.Compare(y.Cost, x.Cost), cmp.Compare(x.Pair, y.Pair))
	})
	return out[:min(len(out), max(p.WeakPairs, 0))]
}

func isLower(r rune) bool { return unicode.IsLetter(r) && unicode.IsLower(r) }
