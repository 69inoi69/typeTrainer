// Package freeplay is the free practice mode: monkeytype-style typing of
// words drawn evenly from the whole word list. There is no unlocking and no
// adaptive choice, and nothing here feeds the letter model of the learning
// mode (internal/engine, the core of the thesis). It is a separate package
// on purpose, so it can grow on its own later without touching the engine.
//
// It also holds the rule of the typing test: the one-time test that opens
// free practice before every letter has been unlocked in learning.
package freeplay

import (
	"math"
	"math/rand"
)

// Params are the tunable numbers of free practice. Values live in internal/config.
type Params struct {
	PortionWords  int     // words per portion (the text grows while you type, as in learning)
	AheadPortions int     // portions waiting after the one being typed
	RoundPortions int     // portions per round (one result in the history)
	RecentWords   int     // RepeatPenalty counts uses in the last this many words
	RepeatPenalty float64 // weight multiplier per recent use of a word: variety

	TestWPM      float64 // the typing test passes at this speed or faster...
	TestAccuracy float64 // ...and with at least this accuracy (percent)
}

// Picker draws words for free practice.
type Picker struct {
	words []string
	rng   *rand.Rand
}

// NewPicker keeps the word list of one language.
func NewPicker(words []string, rng *rand.Rand) *Picker {
	return &Picker{words: words, rng: rng}
}

// Portion returns n words drawn evenly from the whole list:
//
//	P(word) ~ RepeatPenalty^(uses in the last RecentWords words)
//
// Every word starts with the same weight; a word used recently is less
// likely (variety), and the same word never comes twice in a row (unless
// the list has only one word). recent: the words already typed in this
// round, oldest first.
func (pk *Picker) Portion(recent []string, n int, p Params) []string {
	if len(pk.words) == 0 || n <= 0 {
		return nil
	}
	window := recent // the last RecentWords words, updated as words are added
	keep := max(p.RecentWords, 0)
	trim := func() {
		if len(window) > keep {
			window = window[len(window)-keep:]
		}
	}
	trim()
	last := ""
	if len(recent) > 0 {
		last = recent[len(recent)-1]
	}
	out := make([]string, 0, n)
	weights := make([]float64, len(pk.words))
	for len(out) < n {
		uses := map[string]int{}
		for _, w := range window {
			uses[w]++
		}
		total := 0.0
		for i, w := range pk.words {
			weights[i] = math.Pow(p.RepeatPenalty, float64(uses[w]))
			if w == last && len(pk.words) > 1 {
				weights[i] = 0
			}
			total += weights[i]
		}
		w := pk.words[pick(weights, total, pk.rng.Float64())]
		out = append(out, w)
		window = append(window[:len(window):len(window)], w) // never writes into the caller's slice
		trim()
		last = w
	}
	return out
}

// pick returns the index whose segment the point r*total falls in (the
// weights laid end to end); all-zero weights pick uniformly.
func pick(weights []float64, total, r float64) int {
	if total <= 0 {
		return int(r * float64(len(weights)))
	}
	point := r * total
	for i, w := range weights {
		if point < w {
			return i
		}
		point -= w
	}
	for i := len(weights) - 1; i >= 0; i-- { // float rounding
		if weights[i] > 0 {
			return i
		}
	}
	return len(weights) - 1
}

// Passed reports whether a typing test opens free practice: at least
// TestWPM and at least TestAccuracy percent.
func Passed(wpm, accuracy float64, p Params) bool {
	return wpm >= p.TestWPM && accuracy >= p.TestAccuracy
}
