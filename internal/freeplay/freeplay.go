// Package freeplay is Climb, the second mode: for people who can already
// type. There are no letters to unlock; one number, the level (0..1),
// says how hard the text is, and it follows the typist like a thermostat:
// after every portion typed well it goes up a little, after one typed
// badly it goes down (NextLevel). So the text stays just outside the
// comfort zone: hard enough to stretch, never so hard that it falls apart
// (the "flow channel" of Csikszentmihalyi; docs/ALGORITHM.md section 13).
//
// What the level changes, in layers (Portion):
//   - the words: from the most common ones at level 0 to the whole list at 1;
//   - capitals: from CapsFrom on, on a growing share of the words;
//   - punctuation: from PunctFrom on, commas and full stops, and the word
//     after a full stop starts with a capital.
//
// Nothing here feeds the letter model of learning (internal/engine): Climb
// is a separate package on purpose, so the two modes never mix. (The code
// keeps its first name, "freeplay", from when this mode was free practice.)
package freeplay

import (
	"math"
	"math/rand"
	"strings"
	"unicode"
	"unicode/utf8"
)

// Params are the tunable numbers of Climb. Values live in internal/config.
type Params struct {
	PortionWords  int     // words per portion (the text grows while you type, as in learning)
	AheadPortions int     // portions waiting after the one being typed
	RoundPortions int     // portions per round (one result in the history)
	RecentWords   int     // RepeatPenalty counts uses in the last this many words
	RepeatPenalty float64 // weight multiplier per recent use of a word: variety

	// The thermostat (NextLevel).
	LevelStart   float64 // where a new typist starts
	LevelUp      float64 // a portion typed well: the level goes up this much
	LevelDown    float64 // a portion typed badly: down this much
	UpAccuracy   float64 // percent: at or above this, and not slowing down, the level goes up
	DownAccuracy float64 // percent: below this it goes down
	SlowShare    float64 // a portion slower than this share of the round's pace so far is "slowing down"

	// What the level does to the text (Portion).
	RankMin   int     // level 0: only the RankMin most common words; level 1: the whole list
	CapsFrom  float64 // capitals start at this level...
	CapsMax   float64 // ...and reach this share of the words at level 1
	PunctFrom float64 // punctuation starts at this level...
	PunctMax  float64 // ...and follows this share of the words at level 1
	StopShare float64 // of the punctuation marks, this share are full stops, the rest commas
}

// NextLevel is the thermostat: the level after one portion was typed with
// accuracy acc (percent) at wpm, while the round so far went at pace wpm
// (0 = not known yet, the first portion).
//
//	acc <  DownAccuracy                     -> level - LevelDown
//	acc >= UpAccuracy and wpm >= SlowShare * pace -> level + LevelUp
//	otherwise                               -> level stays
//
// Mistakes take it down, clean and steady typing takes it up; clean but
// slowing down (the text is getting hard) holds it where it is. The result
// stays in [0, 1].
func NextLevel(level, acc, wpm, pace float64, p Params) float64 {
	switch {
	case acc < p.DownAccuracy:
		level -= p.LevelDown
	case acc >= p.UpAccuracy && (pace <= 0 || wpm >= p.SlowShare*pace):
		level += p.LevelUp
	}
	return math.Max(0, math.Min(1, level))
}

// layer is how strongly a layer is on at level: 0 below from, rising in a
// straight line to max at level 1.
func layer(level, from, most float64) float64 {
	if level < from || from >= 1 {
		return 0
	}
	return most * (level - from) / (1 - from)
}

// Picker draws the words of Climb. Not safe for parallel use (its random
// source is not), so the api package calls it under Server.genMu.
type Picker struct {
	words []string
	punct []string // the marks the layout has keys for, of "," and "."
	rng   *rand.Rand
}

// NewPicker keeps the word list of one language, most frequent first, and
// the punctuation its layout can type without a modifier (layout data):
// "," and "." where they have keys of their own; none = no punctuation layer.
func NewPicker(words, punct []string, rng *rand.Rand) *Picker {
	return &Picker{words: words, punct: punct, rng: rng}
}

// Base turns a word as typed in Climb back into the word of the list:
// lower case, without punctuation (for "do not repeat").
func Base(w string) string {
	return strings.ToLower(strings.TrimRight(w, ",."))
}

// Portion returns n words for the level:
//
//	the word:   from the MaxRank(level) most common words, with
//	            P(word) ~ RepeatPenalty^(uses in the last RecentWords words)
//	a capital:  with the share layer(level, CapsFrom, CapsMax), and always
//	            after a full stop
//	after it:   a comma or a full stop with the share layer(level, PunctFrom, PunctMax)
//
// The same word never comes twice in a row (unless the list has only one
// word). recent: the words already typed in this round, oldest first, as
// typed (with their capitals and marks).
func (pk *Picker) Portion(recent []string, n int, level float64, p Params) []string {
	if len(pk.words) == 0 || n <= 0 {
		return nil
	}
	size := pk.MaxRank(level, p)
	keep := max(p.RecentWords, 0)
	window := make([]string, 0, keep+n) // the bases of the last RecentWords words
	for _, w := range recent[max(0, len(recent)-keep):] {
		window = append(window, Base(w))
	}
	last, sentence := "", false
	if len(recent) > 0 {
		last = Base(recent[len(recent)-1])
		sentence = strings.HasSuffix(recent[len(recent)-1], ".")
	}
	caps := layer(level, p.CapsFrom, p.CapsMax)
	punct := 0.0
	if len(pk.punct) > 0 {
		punct = layer(level, p.PunctFrom, p.PunctMax)
	}
	out := make([]string, 0, n)
	weights := make([]float64, size)
	for len(out) < n {
		uses := map[string]int{}
		for _, w := range window {
			uses[w]++
		}
		total := 0.0
		for i, w := range pk.words[:size] {
			weights[i] = math.Pow(p.RepeatPenalty, float64(uses[w]))
			if w == last && size > 1 {
				weights[i] = 0
			}
			total += weights[i]
		}
		base := pk.words[pick(weights, total, pk.rng.Float64())]
		word := base
		if sentence || (caps > 0 && pk.rng.Float64() < caps) {
			word = capitalize(base)
		}
		sentence = false
		if punct > 0 && pk.rng.Float64() < punct {
			mark := pk.punct[0]
			if len(pk.punct) > 1 { // both: full stops are StopShare of the marks
				mark = ","
				if pk.rng.Float64() < p.StopShare {
					mark = "."
				}
			}
			word += mark
			sentence = mark == "."
		}
		out = append(out, word)
		window = append(window, base)
		if len(window) > keep {
			window = window[len(window)-keep:]
		}
		last = base
	}
	return out
}

// MaxRank is how many of the most common words the level allows: RankMin at
// level 0, growing in a straight line to the whole list at level 1.
func (pk *Picker) MaxRank(level float64, p Params) int {
	n := len(pk.words)
	lo := min(max(p.RankMin, 1), n)
	return min(n, lo+int(math.Round(math.Max(0, math.Min(1, level))*float64(n-lo))))
}

// capitalize puts the first letter in upper case (Polish, Cyrillic too).
func capitalize(w string) string {
	r, size := utf8.DecodeRuneInString(w)
	if r == utf8.RuneError {
		return w
	}
	return string(unicode.ToUpper(r)) + w[size:]
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
