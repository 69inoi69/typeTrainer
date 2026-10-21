// Package freeplay is the two modes outside learning. Mostly Climb, the
// second mode: for people who can already type. There are no letters to
// unlock; one number, the level (1..10), says which words come, and
// nothing else: lower-case words only, no capitals, no punctuation (owner,
// 2026-10-20: Climb trains the words themselves; a comma in a list of
// random words only breaks the rhythm).
//
// Level n draws from the Levels[n-1] most common words of a long list
// (free.txt, 25 000 words in English): 200 at level 1 to all 25 000 at 10
// (MaxRank). A round is typed at one level from start to end, so it is an
// exam with a clear answer. After it (Standing): a round typed cleanly
// (accuracy >= PassAccuracy) passes, one typed badly (< FailAccuracy)
// fails; PassesUp passes take the typist one level up, FailsDown fails in
// a row one level down. Speed never counts (owner, 2026-10-20). The
// counts are not stored: they come from the history, where every round
// keeps the level it was typed at (docs/ALGORITHM.md section 13).
//
// And one thing that is the typist's own: a share of the words carries one
// of their weak letter pairs, the movements their last rounds were slowest
// or least accurate on (weak.go).
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
	"slices"
	"strings"
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

	// The levels (MaxRank, Standing). To add a level: one more number in
	// Levels (and its texts in web/i18n.js).
	Levels       []int   // level n: the Levels[n-1] most common words, growing
	LevelStart   int     // where a new typist starts
	PassAccuracy float64 // percent: a round at or above this passes
	FailAccuracy float64 // percent: a round below this fails
	PassesUp     int     // this many passes on a level: one level up
	FailsDown    int     // this many fails in a row: one level down
	History      int     // Standing reads at most the last this many rounds
	MinLetters   int     // Climb leaves out words shorter than this (Freetype keeps them; Longer)

	// The typist's weak pairs (weak.go WeakPairs, Portion).
	WeakRounds     int     // the pairs are counted over the last this many Climb rounds
	WeakMinSamples int     // a pair needs this many presses before it can be weak
	WeakMissMs     float64 // a mistake on a pair counts as a press this slow (ms)
	WeakPairs      int     // at most this many weak pairs are practised at once
	WeakShare      float64 // this share of the words carry one of them (0 = off)
	WeakMinWords   int     // ...but only when the level allows at least this many such words

	// Freetype, the third mode (Picker.Freetype): the word lists it offers,
	// as "the n most common words". A language offers the ones its list
	// (free.txt) is long enough for.
	FreetypeLists []int
	// Freetype's kinds of text (2026-10-21). Long words: words of at least
	// LongMin letters (Picker.Freetype). Sentences (Sentences.Portion):
	// TextMarks are the marks a sentence (or your own text) may hold
	// besides letters and capitals; a sentence already in the round is
	// drawn again, up to SentenceTries times.
	LongMin       int
	TextMarks     string
	SentenceTries int
}

// Verdict is what one Climb round says about its level.
type Verdict string

const (
	Pass Verdict = "pass" // typed cleanly: counts towards the next level
	Hold Verdict = "hold" // neither: changes nothing
	Fail Verdict = "fail" // typed badly: the passes start again
)

// Judge is the verdict of a round typed with accuracy acc (percent).
func Judge(acc float64, p Params) Verdict {
	switch {
	case acc >= p.PassAccuracy:
		return Pass
	case acc < p.FailAccuracy:
		return Fail
	}
	return Hold
}

// Round is what Standing needs of one Climb round: its level and accuracy.
type Round struct {
	Level    int
	Accuracy float64
}

// Place is where a typist stands in Climb: the level of their next round
// and how far they are on it.
type Place struct {
	Level  int `json:"level"`  // the next round's level
	Passes int `json:"passes"` // passes on it so far (0..PassesUp-1)
	Fails  int `json:"fails"`  // fails in a row on it (0..FailsDown-1)
	Moved  int `json:"moved"`  // +1 / -1: the last round moved the level; 0: it did not
}

// Standing is where the history leaves the typist. rounds: their Climb
// rounds, oldest first. Only the last run of rounds at one level counts:
// a round at another level (the level moved, or the typist picked one)
// starts the counts again. Along the run, round by round:
//
//	pass: passes + 1, fails = 0; at PassesUp: one level up (not above the last)
//	fail: passes = 0, fails + 1; at FailsDown: one level down (not below 1)
//	hold: fails = 0 (they are no longer in a row)
//
// A move sets both counts to 0. When the run goes on at the same level
// after a move (the typist picked it again, or the top or bottom level),
// the counts start from 0. No rounds: LevelStart.
func Standing(rounds []Round, p Params) Place {
	top := max(len(p.Levels), 1)
	if len(rounds) == 0 {
		return Place{Level: clampLevel(p.LevelStart, top)}
	}
	level := clampLevel(rounds[len(rounds)-1].Level, top)
	first := len(rounds) - 1
	for first > 0 && clampLevel(rounds[first-1].Level, top) == level {
		first--
	}
	var at Place
	for _, r := range rounds[first:] {
		at.Moved = 0
		switch Judge(r.Accuracy, p) {
		case Pass:
			at.Passes, at.Fails = at.Passes+1, 0
			if at.Passes >= p.PassesUp {
				at.Passes = 0
				if level < top {
					at.Moved = 1
				}
			}
		case Fail:
			at.Passes, at.Fails = 0, at.Fails+1
			if at.Fails >= p.FailsDown {
				at.Fails = 0
				if level > 1 {
					at.Moved = -1
				}
			}
		default:
			at.Fails = 0
		}
	}
	at.Level = level + at.Moved
	return at
}

// clampLevel keeps a level within 1..top.
func clampLevel(level, top int) int { return max(1, min(top, level)) }

// LevelFromOld turns a level of the old Climb (0..1, shown as 1..100,
// until 2026-10-20) into one of the 10 levels: the old number divided by
// 10, rounded up (1-10 -> 1, 44 -> 5, 91-100 -> 10). Used once, when old
// history is loaded (migration 008, import).
func LevelFromOld(old float64) int {
	shown := math.Round(math.Max(0, math.Min(1, old))*99) + 1
	return int(math.Ceil(shown / 10))
}

// Picker draws the words of Climb or Freetype (one Picker per mode, both
// on the long list, free.txt). Not safe for parallel use (its random
// source is not), so the api package calls it under Server.genMu.
type Picker struct {
	words []string
	rng   *rand.Rand
}

// NewPicker keeps the word list of one language, most frequent first.
func NewPicker(words []string, rng *rand.Rand) *Picker {
	return &Picker{words: words, rng: rng}
}

// Longer returns the words with at least min letters, in their order: the
// list of Climb (owner, 2026-10-20: "a" and "i" are not words worth
// typing). Freetype keeps the whole list, as on monkeytype.
func Longer(words []string, min int) []string {
	out := make([]string, 0, len(words))
	for _, w := range words {
		if utf8.RuneCountInString(w) >= min {
			out = append(out, w)
		}
	}
	return out
}

// Portion returns n words for the level:
//
//	the word:   from the MaxRank(level) most common words (draw)
//	weak:       with the share WeakShare, a word that contains one of the
//	            weak pairs (WeakPairs), from the same MaxRank(level) words;
//	            when the level allows fewer than WeakMinWords of them, none
//
// recent: the words already typed in this round, oldest first. weak: the
// typist's weak pairs (none = the plain draw).
func (pk *Picker) Portion(recent []string, n, level int, weak []string, p Params) []string {
	size := pk.MaxRank(level, p)
	var pool []int
	if len(weak) > 0 && p.WeakShare > 0 {
		for i, w := range pk.words[:size] {
			if slices.ContainsFunc(weak, func(pair string) bool { return strings.Contains(w, pair) }) {
				pool = append(pool, i)
			}
		}
		if len(pool) < p.WeakMinWords {
			pool = nil
		}
	}
	return pk.drawFrom(recent, n, size, pool, p.WeakShare, p)
}

// Freetype returns n words for Freetype, the third mode: from the size most
// common words (draw). The typist chose size; nothing adapts. long: only
// words of at least LongMin letters (the whole list if it has none).
func (pk *Picker) Freetype(recent []string, n, size int, long bool, p Params) []string {
	size = min(max(size, 1), len(pk.words))
	var pool []int
	if long {
		for i, w := range pk.words[:size] {
			if utf8.RuneCountInString(w) >= p.LongMin {
				pool = append(pool, i)
			}
		}
	}
	if len(pool) == 0 {
		pool = nil // no long words in the list: any word
	}
	return pk.drawFrom(recent, n, size, pool, 1, p)
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
// The same word never comes twice in a row (unless the list has only one
// word). pool (nil = none): the places of some of the words (Climb: the
// ones with a weak pair; Freetype: the long ones); each word comes from it
// with the chance share, by the same rule.
func (pk *Picker) drawFrom(recent []string, n, size int, pool []int, share float64, p Params) []string {
	if len(pk.words) == 0 || n <= 0 {
		return nil
	}
	keep := max(p.RecentWords, 0)
	window := make([]string, 0, keep+n) // the last RecentWords words
	window = append(window, recent[max(0, len(recent)-keep):]...)
	last := ""
	if len(recent) > 0 {
		last = recent[len(recent)-1]
	}
	out := make([]string, 0, n)
	for len(out) < n {
		from := []int(nil) // nil: any of the size most common
		if pool != nil && pk.rng.Float64() < share {
			from = pool
		}
		word := pk.words[pk.drawWord(window, last, size, from, p)]
		out = append(out, word)
		window = append(window, word)
		if len(window) > keep {
			window = window[len(window)-keep:]
		}
		last = word
	}
	return out
}

// drawWord picks the index of one word of the first size (or of from, the
// indexes given, when not nil), with the weight RepeatPenalty^(uses in
// window), and 0 for last. First by rejection: a random word is kept with
// the chance of its weight (at most 1), which gives exactly those odds;
// most words are not recent, so this almost always ends at once. After
// tries misses (a short list full of recent words) it weighs every word
// instead, with the same odds.
func (pk *Picker) drawWord(window []string, last string, size int, from []int, p Params) int {
	count := size
	at := func(k int) int { return k } // the k-th candidate's index in words
	if from != nil {
		count = len(from)
		at = func(k int) int { return from[k] }
	}
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
		i := at(pk.rng.Intn(count))
		if pk.rng.Float64() < weight(pk.words[i]) {
			return i
		}
	}
	// weigh every candidate: once for the total, once more to find where the
	// random point falls (no slice of weights: nothing allocated per call)
	total := 0.0
	for k := range count {
		total += weight(pk.words[at(k)])
	}
	if total <= 0 { // every weight 0: any candidate
		return at(pk.rng.Intn(count))
	}
	point, found := pk.rng.Float64()*total, at(count-1)
	for k := range count {
		i := at(k)
		x := weight(pk.words[i])
		if x > 0 {
			found = i // float rounding: the last candidate with a weight
		}
		if point < x {
			return i
		}
		point -= x
	}
	return found
}

// MaxRank is how many of the most common words the level allows: the
// Levels[level-1] most common, or the whole list when it is shorter (the
// hidden languages). A level out of 1..len(Levels) counts as the nearest
// one.
//
// The steps (200, 500, 1 000, 2 000, ... 25 000 in config) roughly double
// the words at each level, because word frequencies fall steeply (Zipf's
// law): a straight line from 200 to 25 000 would reach words nobody types
// ("pippin", "dubbing") by level 5 (docs/ALGORITHM.md section 13).
func (pk *Picker) MaxRank(level int, p Params) int {
	if len(p.Levels) == 0 {
		return len(pk.words)
	}
	return min(len(pk.words), max(1, p.Levels[clampLevel(level, len(p.Levels))-1]))
}
