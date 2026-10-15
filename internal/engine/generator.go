package engine

// This file chooses WHAT the user types: the order in which letters open,
// when the next one opens, and which real words fill the text. It uses the
// difficulty scores of model.go and is explained in docs/ALGORITHM.md,
// sections 6 (unlocking) and 7 (choosing the words). internal/api calls
// Portion (or RandomPortion for the hidden control group) for every few
// words and NextUnlocked after every saved round.

import (
	"math"
	"math/rand"
	"sort"
	"strings"
	"unicode/utf8"
)

// Generator builds exercises out of REAL words (no random letter soup).
//
// Two ideas work together:
//
//  1. Unlocking. Letters are opened one at a time, most frequent first.
//     Only words made entirely of open letters can appear. A new letter
//     opens when every open letter is mastered (see Mastered in model.go).
//
//  2. Focus. Inside the open letters, weak letters are chosen more often
//     (softmax over difficulty), and words that contain them are preferred.
//
// There is one Generator per language, made once at start (setup.go). Its
// random source is not safe for parallel use, so internal/api locks around
// every call (genMu).
type Generator struct {
	words []string       // the dictionary, most frequent first
	rank  map[string]int // word -> its place in words (0 = the most frequent)
	order []string       // unlock order: letters sorted by frequency in the dictionary
	start int            // how many letters the first lesson has
	wp    WordParams     // how the frequency limit grows (SetWordParams)
	floor map[string]int // letter -> rank of its FloorWords-th most common word in the whole list
	rng   *rand.Rand
}

// WordParams say how far down the frequency list the words may come from
// (docs/ALGORITHM.md section 7). They live here and not in Params because
// they only concern word choice, never the letter model of model.go.
type WordParams struct {
	// FloorWords: a letter that is rare among the common words (Russian
	// "ф") gets its FloorWords most common words of the whole list without
	// the frequency penalty when it is the focus, so it is not trained on
	// one word again and again. 0 = off.
	FloorWords int
	// RampLetters: how many letters the user types in learning after the
	// whole alphabet is open until MaxRank reaches the whole list. <= 0 =
	// the whole list right away.
	RampLetters float64
}

// SetWordParams sets the frequency limit numbers (zero values: no floor,
// no ramp). Call it once, before the generator is used.
func (g *Generator) SetWordParams(wp WordParams) {
	g.wp = wp
	g.floor = map[string]int{}
	if wp.FloorWords <= 0 {
		return
	}
	count := map[rune]int{}
	for i, w := range g.words { // most frequent first
		seen := map[rune]bool{}
		for _, r := range w {
			if seen[r] {
				continue
			}
			seen[r] = true
			if count[r] < wp.FloorWords {
				count[r]++
				g.floor[string(r)] = i // the last one counted is the FloorWords-th (or the last word)
			}
		}
	}
}

// NewGenerator computes the unlock order and the first lesson size once.
// words must be ordered most frequent first (data/langs/<id>/words.txt is);
// a word that appears twice keeps its first, better rank.
func NewGenerator(words []string, rng *rand.Rand, p Params) *Generator {
	g := &Generator{words: words, rng: rng, rank: map[string]int{}}
	for i, w := range words {
		if _, ok := g.rank[w]; !ok {
			g.rank[w] = i
		}
	}
	g.order = letterOrder(words)
	g.start = g.firstLessonSize(p)
	return g
}

// letterOrder sorts letters by how often they appear in the word list.
// With the included English list this gives e a r s t i n o l d ... (the
// table in docs/ALGORITHM.md section 6), so the first lessons already allow
// many real words.
func letterOrder(words []string) []string {
	count := map[string]int{}
	for _, w := range words {
		for _, r := range w {
			count[string(r)]++
		}
	}
	order := make([]string, 0, len(count))
	for c := range count {
		order = append(order, c)
	}
	sort.Slice(order, func(i, j int) bool {
		if count[order[i]] != count[order[j]] {
			return count[order[i]] > count[order[j]]
		}
		return order[i] < order[j] // tie-break: alphabetical, so the order is stable
	})
	return order
}

// firstLessonSize: start with StartLetters, but add letters until at least
// MinWords real words can be built. Otherwise the first lesson would repeat
// the same 5 words forever.
func (g *Generator) firstLessonSize(p Params) int {
	n := p.StartLetters
	if n > len(g.order) {
		n = len(g.order)
	}
	for n < len(g.order) && len(g.eligible(n)) < p.MinWords {
		n++
	}
	return n
}

// Order returns the unlock order. The slice is shared: do not modify it.
func (g *Generator) Order() []string { return g.order }

// Start returns the first lesson size (how many letters a new user has).
func (g *Generator) Start() int { return g.start }

// Clamp keeps an unlocked count inside [Start, number of letters].
// A stored value of 0 means "new user" and becomes Start.
func (g *Generator) Clamp(unlocked int) int {
	if unlocked < g.start {
		return g.start
	}
	if unlocked > len(g.order) {
		return len(g.order)
	}
	return unlocked
}

// NextUnlocked decides whether to open the next letter: yes if every open
// letter is mastered. At most one letter per call (internal/api calls it
// once per saved round), so the user is never flooded with new keys.
// It returns the new unlocked count, already clamped.
func (g *Generator) NextUnlocked(stats map[string]KeyStat, unlocked int, p Params) int {
	unlocked = g.Clamp(unlocked)
	if unlocked == len(g.order) {
		return unlocked
	}
	for _, c := range g.order[:unlocked] {
		if !Mastered(stats[c], p) {
			return unlocked
		}
	}
	return unlocked + 1
}

// Words returns the words that can appear when `unlocked` letters are open.
func (g *Generator) Words(unlocked int) []string { return g.eligible(g.Clamp(unlocked)) }

// letterRune turns a one-letter string ("e", "ą", "ж") into its rune.
// (c[0] would only be the first BYTE, which is wrong for ą or Cyrillic,
// because those letters take two bytes in UTF-8.)
func letterRune(c string) rune {
	r, _ := utf8.DecodeRuneInString(c)
	return r
}

// eligible returns the words that use only the first n letters of the order.
func (g *Generator) eligible(n int) []string {
	open := map[rune]bool{}
	for _, c := range g.order[:n] {
		open[letterRune(c)] = true
	}
	var out []string
	for _, w := range g.words {
		ok := true
		for _, r := range w {
			if !open[r] {
				ok = false
				break
			}
		}
		if ok {
			out = append(out, w)
		}
	}
	return out
}

// Exercise is what Next returns: a whole exercise as one text.
type Exercise struct {
	Text     string   `json:"text"`     // ExerciseWords words separated by spaces; "" if no word is possible
	Focus    string   `json:"focus"`    // the currently weakest open letter
	Unlocked []string `json:"unlocked"` // open letters, in unlock order
	Locked   []string `json:"locked"`   // letters still to come, in order
}

// pool is what both Next and Portion need before they pick words: the
// difficulty and softmax weight of every open letter, the open words grouped
// by letter, each word's difficulty weight exp(meanDifficulty / T) and its
// place in the frequency list (for RankWeight).
type pool struct {
	open     []string
	words    []string
	index    map[string]int   // word -> its index in words
	letterW  []float64        // softmax weight of open[i]
	byLetter map[string][]int // letter -> indexes of the words that contain it, most common first
	diffW    []float64        // difficulty weight of words[i]
	rank     []int            // frequency rank of words[i]
	maxRank  float64          // MaxRank of this pool
	floor    map[string]int   // Generator.floor
	weakest  string           // the open letter with the highest difficulty
}

// newPool computes the pool for the current statistics. It is built again
// for every portion (not cached), so each portion uses the newest numbers.
func (g *Generator) newPool(stats map[string]KeyStat, unlocked, typed int, p Params) *pool {
	pl := &pool{open: g.order[:unlocked], words: g.eligible(unlocked), index: map[string]int{}, byLetter: map[string][]int{},
		maxRank: g.MaxRank(unlocked, typed, p), floor: g.floor}
	diff := map[rune]float64{}
	pl.letterW = make([]float64, len(pl.open))
	best := -1.0
	for i, c := range pl.open {
		d := Difficulty(stats[c], p)
		diff[letterRune(c)] = d
		pl.letterW[i] = SoftmaxWeight(d, p)
		if d > best {
			best, pl.weakest = d, c
		}
	}
	pl.diffW = make([]float64, len(pl.words))
	pl.rank = make([]int, len(pl.words))
	for i, w := range pl.words {
		pl.index[w] = i
		sum := 0.0
		seen := map[rune]bool{}
		for _, r := range w {
			sum += diff[r]
			if !seen[r] {
				seen[r] = true
				pl.byLetter[string(r)] = append(pl.byLetter[string(r)], i)
			}
		}
		pl.diffW[i] = SoftmaxWeight(sum/float64(len(w)), p)
		pl.rank[i] = g.rank[w]
	}
	return pl
}

// letterMaxRank is MaxRank for the words of one focus letter: never below
// the rank of the letter's FloorWords-th most common word in the whole list.
// For most letters that word is far inside RankStart and nothing changes;
// a letter with few common words (Russian "ф": its 10th word is at rank
// ~1400) gets its most common words without the penalty. Counting in the
// whole list, not only among open words, keeps the first lessons on common
// words: there every letter has few open words.
func (pl *pool) letterMaxRank(letter string) float64 {
	floor, ok := pl.floor[letter]
	if !ok {
		return pl.maxRank
	}
	return max(pl.maxRank, float64(floor))
}

// Rank is a word's place in the frequency list (0 = the most frequent word);
// -1 for a word that is not in the list.
func (g *Generator) Rank(word string) int {
	if r, ok := g.rank[word]; ok {
		return r
	}
	return -1
}

// MaxRank is the frequency rank up to which words get no penalty. It is
// flat while the user is still learning the letters and grows only after
// the whole alphabet is open:
//
//	letters still locked:  MaxRank = RankStart
//	every letter open:     MaxRank = RankStart + (words - RankStart) * min(1, typed / RampLetters)
//
// typed = letters typed in learning since every letter was open. So, like
// monkeytype's "English 200 / 1k / 2k", the user meets only the most common
// words while new letters keep coming (one difficulty at a time), and rarer
// words enter step by step once the keyboard is known. The limit never goes
// below RankStart, and never above the whole list.
func (g *Generator) MaxRank(unlocked, typed int, p Params) float64 {
	start, end := float64(p.RankStart), float64(len(g.words))
	if end < start { // a short list: never lower the limit
		end = start
	}
	if g.Clamp(unlocked) < len(g.order) {
		return start
	}
	progress := 1.0
	if g.wp.RampLetters > 0 {
		progress = min(1, max(0, float64(typed)/g.wp.RampLetters))
	}
	return start + (end-start)*progress
}

// RankWeight is the frequency part of a word's weight:
//
//	RankPenalty ^ (max(0, rank - maxRank) / RankStep)
//
// 1 for a word that is common enough; every RankStep places further down the
// list multiply the weight by RankPenalty (0.5 = half as likely). The weight
// never becomes 0, so a rare word stays possible and a letter that only has
// rare words still gets practised. A RankPenalty outside (0, 1) or a
// RankStep <= 0 turns the penalty off.
func RankWeight(rank int, maxRank float64, p Params) float64 {
	over := float64(rank) - maxRank
	if over <= 0 || p.RankStep <= 0 || p.RankPenalty <= 0 || p.RankPenalty >= 1 {
		return 1
	}
	return math.Pow(p.RankPenalty, over/p.RankStep)
}

// pickFocus is step 1: a focus letter with P(letter) ~ exp(difficulty / T).
func (pl *pool) pickFocus(r float64) string { return pl.open[WeightedPick(pl.letterW, r)] }

// pickWord is step 2: a word that contains the focus letter, with
// P(word) ~ exp(meanDifficulty / T) * RankWeight * RepeatPenalty^uses, where
// RankWeight uses the letter's own limit (letterMaxRank). Words in `avoid`
// (the neighbours of this slot) are never picked, so no word appears twice
// in a row. Returns an index into pl.words.
func (pl *pool) pickWord(focus string, uses []int, p Params, r float64, avoid ...int) int {
	n := 0 // how many different words are avoided
	for i, a := range avoid {
		if a >= 0 && !contains(avoid[:i], a) {
			n++
		}
	}
	// (with nothing else left, a repeat is allowed: one-word dictionary)
	banned := func(idx int) bool { return n < len(pl.words) && contains(avoid, idx) }
	cands := pl.byLetter[focus]
	maxRank := pl.letterMaxRank(focus)
	if len(cands) == 0 { // a letter with no open word: pick from all words
		cands = make([]int, len(pl.words))
		for i := range pl.words {
			cands[i] = i
		}
	}
	w := make([]float64, len(cands))
	for j, idx := range cands {
		w[j] = pl.diffW[idx] * RankWeight(pl.rank[idx], maxRank, p)
		for u := 0; u < uses[idx]; u++ {
			w[j] *= p.RepeatPenalty
		}
		if banned(idx) {
			w[j] = 0
		}
	}
	if idx := cands[WeightedPick(w, r)]; !banned(idx) {
		return idx
	}
	// every candidate was banned (the focus letter has only those words):
	// the first allowed word from a random place in the list
	start := int(r * float64(len(pl.words)))
	for k := range pl.words {
		if idx := (start + k) % len(pl.words); !banned(idx) {
			return idx
		}
	}
	return start
}

// letters splits the unlock order into open and locked letters. Both are
// copies, so a caller (or JSON encoding) can never change g.order.
func (g *Generator) letters(unlocked int) (open, locked []string) {
	return append([]string{}, g.order[:unlocked]...), append([]string{}, g.order[unlocked:]...)
}

// Next builds one exercise of ExerciseWords words in one go.
//
// For every word slot:
//  1. pick a FOCUS letter: P(letter) ~ exp(difficulty / T)        (what to train)
//  2. take the open words that contain it, and pick one with
//     P(word) ~ exp(meanDifficulty(word) / T) * RepeatPenalty^uses (how to train it)
//
// Step 2 prefers words with several weak letters (e.g. both 'r' and 's'
// when both are weak) and avoids repeating a word within one exercise.
//
// The app now uses Portion (the stream); Next is kept as the earlier
// strategy, so the simulation can compare the two.
func (g *Generator) Next(stats map[string]KeyStat, unlocked, typed int, p Params) Exercise {
	unlocked = g.Clamp(unlocked)
	ex := Exercise{}
	ex.Unlocked, ex.Locked = g.letters(unlocked)
	pl := g.newPool(stats, unlocked, typed, p)
	if len(pl.words) == 0 {
		return ex
	}
	ex.Focus = pl.weakest

	uses := make([]int, len(pl.words))
	out := make([]string, 0, p.ExerciseWords)
	last := -1
	for len(out) < p.ExerciseWords {
		focus := pl.pickFocus(g.rng.Float64())
		idx := pl.pickWord(focus, uses, p, g.rng.Float64(), last)
		uses[idx]++
		last = idx
		out = append(out, pl.words[idx])
	}
	ex.Text = strings.Join(out, " ")
	return ex
}

// Portion is a few words of the stream, all built around one focus letter.
// It is sent to the browser as JSON by POST /api/v1/portion.
type Portion struct {
	Words    []string `json:"words"`    // PortionWords words; empty if no word is possible
	Focus    string   `json:"focus"`    // the letter this portion trains
	Weakest  string   `json:"weakest"`  // the open letter with the highest difficulty
	Unlocked []string `json:"unlocked"` // open letters, in unlock order
	Locked   []string `json:"locked"`   // letters still to come, in order
}

// Portion builds the next PortionWords words of the stream (the text the
// user types is a stream of portions, each built from the newest statistics,
// see docs/ALGORITHM.md section 7).
//
//   - typed: letters typed in learning since every letter was open (MaxRank).
//   - recent: the words already in the stream, oldest first. Only the last
//     RecentWords count for RepeatPenalty, and the next word is never the
//     same as the last one.
//   - retry: words the user typed with a mistake. Up to RetryWords of them
//     that are still allowed come back in this portion, at random places.
//
// The rest of the slots: ONE focus letter for the whole portion (step 1 of
// Next, done once), then each word is step 2 of Next for that letter.
func (g *Generator) Portion(stats map[string]KeyStat, unlocked, typed int, recent, retry []string, p Params) Portion {
	unlocked = g.Clamp(unlocked)
	por := Portion{}
	por.Unlocked, por.Locked = g.letters(unlocked)
	pl := g.newPool(stats, unlocked, typed, p)
	if len(pl.words) == 0 || p.PortionWords <= 0 {
		return por
	}
	por.Weakest = pl.weakest
	por.Focus = pl.pickFocus(g.rng.Float64())

	uses := make([]int, len(pl.words))
	if len(recent) > p.RecentWords {
		recent = recent[len(recent)-p.RecentWords:]
	}
	last := -1
	for _, w := range recent {
		if idx, ok := pl.index[w]; ok {
			uses[idx]++
			last = idx
		} else {
			last = -1
		}
	}

	// the retry words first, each in a random free slot (not right after
	// the same word)
	slots := make([]int, p.PortionWords) // index into pl.words, -1 = free
	for i := range slots {
		slots[i] = -1
	}
	placed := 0
	for _, w := range retry {
		idx, ok := pl.index[w]
		if !ok || placed >= p.RetryWords || contains(slots, idx) {
			continue
		}
		free := []int{}
		for i, s := range slots {
			if s == -1 && !(i == 0 && idx == last) {
				free = append(free, i)
			}
		}
		if len(free) == 0 {
			continue
		}
		slots[free[g.rng.Intn(len(free))]] = idx
		placed++
	}

	// the free slots, in order: never the same word as either neighbour
	for i := range slots {
		if slots[i] == -1 {
			next := -1
			if i+1 < len(slots) {
				next = slots[i+1]
			}
			slots[i] = pl.pickWord(por.Focus, uses, p, g.rng.Float64(), last, next)
		}
		uses[slots[i]]++
		last = slots[i]
	}
	por.Words = make([]string, len(slots))
	for i, idx := range slots {
		por.Words[i] = pl.words[idx]
	}
	return por
}

// contains reports whether x is in xs (the lists here are a few items long).
func contains(xs []int, x int) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}

// WeightedPick picks an index with probability proportional to its weight.
// r must be a random number in [0, 1). Taking r as a parameter keeps the
// function deterministic, which is what the unit tests need.
//
// Picture the weights as segments laid end to end; r * total is a point on
// that line and we return the segment it lands in. All-zero weights fall
// back to a uniform pick. Empty input returns -1.
func WeightedPick(weights []float64, r float64) int {
	if len(weights) == 0 {
		return -1
	}
	total := 0.0
	for _, w := range weights {
		if w > 0 {
			total += w
		}
	}
	if total == 0 {
		return int(r * float64(len(weights)))
	}
	point := r * total
	for i, w := range weights {
		if w <= 0 {
			continue
		}
		if point < w {
			return i
		}
		point -= w
	}
	// float rounding: return the last index with a positive weight
	for i := len(weights) - 1; i >= 0; i-- {
		if weights[i] > 0 {
			return i
		}
	}
	return len(weights) - 1
}

// RandomPortion is the word choice of the control group of a user study
// (docs/ALGORITHM.md section 11): PortionWords open words drawn uniformly
// at random, never the same word twice in a row (last = the word before the
// portion). Everything else stays as in learning (the same open letters,
// the same statistics and unlocking), so a study compares only the word
// choice. No focus letter, no frequency penalty, no mistyped words coming
// back: those are part of the algorithm being tested.
func (g *Generator) RandomPortion(unlocked int, last string, p Params) Portion {
	unlocked = g.Clamp(unlocked)
	por := Portion{}
	por.Unlocked, por.Locked = g.letters(unlocked)
	words := g.eligible(unlocked)
	if len(words) == 0 || p.PortionWords <= 0 {
		return por
	}
	for len(por.Words) < p.PortionWords {
		w := words[g.rng.Intn(len(words))]
		if w == last && len(words) > 1 {
			continue
		}
		por.Words = append(por.Words, w)
		last = w
	}
	return por
}
