// Package freeplay is the two modes outside learning. Mostly Climb, the
// second mode: for people who can already type. There are no letters to unlock; one number, the level (0..1),
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
// Freetype, the third mode, is the plain draw underneath (Picker.Freetype):
// words from the N most common ones of a long list (free.txt), N chosen by
// the typist, as on monkeytype; nothing adapts.
//
// Nothing here feeds the letter model of learning (internal/engine): these
// modes are a separate package on purpose, so they never mix with it.
package freeplay

import (
	"math"
	"math/rand"
	"strings"
	"unicode"
	"unicode/utf8"
)

// Params are the tunable numbers of Climb and Freetype. Values live in
// internal/config.
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
	PartialMin   int     // the last, shorter portion of a round moves the level only with at least this many words

	// What the level does to the text (Portion).
	RankMin   int     // level 0: only the RankMin most common words; level 1: the whole list
	CapsFrom  float64 // capitals start at this level...
	CapsMax   float64 // ...and reach this share of the words at level 1
	PunctFrom float64 // punctuation starts at this level...
	PunctMax  float64 // ...and follows this share of the words at level 1
	StopShare float64 // of the punctuation marks, this share are full stops, the rest commas

	// Freetype, the third mode (Picker.Freetype): the word lists it offers,
	// as "the n most common words". A language offers the ones its list
	// (free.txt) is long enough for.
	FreetypeLists []int
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

// Picker draws the words of Climb or Freetype (one Picker per word list:
// words.txt for Climb, free.txt for Freetype). Not safe for parallel use (its random
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
//	the word:   from the MaxRank(level) most common words (draw)
//	a capital:  with the share layer(level, CapsFrom, CapsMax), and always
//	            after a full stop
//	after it:   a comma or a full stop with the share layer(level, PunctFrom, PunctMax)
//
// recent: the words already typed in this round, oldest first, as typed
// (with their capitals and marks).
func (pk *Picker) Portion(recent []string, n int, level float64, p Params) []string {
	punct := 0.0
	if len(pk.punct) > 0 {
		punct = layer(level, p.PunctFrom, p.PunctMax)
	}
	return pk.draw(recent, n, pk.MaxRank(level, p), layer(level, p.CapsFrom, p.CapsMax), punct, p)
}

// Freetype returns n words for Freetype, the third mode: from the size most
// common words, in lower case, without punctuation (draw). The typist
// chose size; nothing adapts.
func (pk *Picker) Freetype(recent []string, n, size int, p Params) []string {
	return pk.draw(recent, n, min(max(size, 1), len(pk.words)), 0, 0, p)
}

// Size is how many words the list has.
func (pk *Picker) Size() int { return len(pk.words) }

// tries: how many random words drawWord tries before it weighs the whole
// list. Not a tuning value: either way the result has the same odds; it
// only saves time on long lists (Freetype: 25 000 words).
const tries = 32

// draw returns n words from the size most common ones, with
//
//	P(word) ~ RepeatPenalty^(uses in the last RecentWords words)
//
// a capital on the share caps of the words (and always after a full stop)
// and a mark after the share punct of them. The same word never comes
// twice in a row (unless the list has only one word).
func (pk *Picker) draw(recent []string, n, size int, caps, punct float64, p Params) []string {
	if len(pk.words) == 0 || n <= 0 {
		return nil
	}
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
	out := make([]string, 0, n)
	for len(out) < n {
		base := pk.words[pk.drawWord(window, last, size, p)]
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

// drawWord picks the index of one word of the first size, with the weight
// RepeatPenalty^(uses in window), and 0 for last. First by rejection: a
// random word is kept with the chance of its weight (at most 1), which
// gives exactly those odds; most words are not recent, so this almost
// always ends at once. After tries misses (a short list full of recent
// words) it weighs every word instead, with the same odds.
func (pk *Picker) drawWord(window []string, last string, size int, p Params) int {
	uses := make(map[string]int, len(window))
	for _, w := range window {
		uses[w]++
	}
	weight := func(w string) float64 {
		if w == last && size > 1 {
			return 0
		}
		return math.Pow(p.RepeatPenalty, float64(uses[w]))
	}
	for range tries {
		i := pk.rng.Intn(size)
		if pk.rng.Float64() < weight(pk.words[i]) {
			return i
		}
	}
	// weigh the whole list: once for the total, once more to find where the
	// random point falls (no slice of weights: nothing allocated per call)
	total := 0.0
	for _, w := range pk.words[:size] {
		total += weight(w)
	}
	if total <= 0 { // every weight 0: any word
		return pk.rng.Intn(size)
	}
	point, found := pk.rng.Float64()*total, size-1
	for i, w := range pk.words[:size] {
		x := weight(w)
		if x > 0 {
			found = i // float rounding: the last word with a weight
		}
		if point < x {
			return i
		}
		point -= x
	}
	return found
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
