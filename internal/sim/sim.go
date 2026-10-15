// Package sim is a SIMULATION for the evaluation chapter of the thesis:
// does the adaptive word choice really teach faster than simpler choices?
//
// A simulated typist has a hidden error probability and a hidden time for
// every letter. Each time it types a letter, that letter gets a little better.
// Three strategies pick the words; all of them use the same statistics, the
// same unlocking rule and the same typist, only the word choice differs:
//
//   - Random:   any open word, uniformly (no adaptation at all)
//   - BestOfN:  monkeytype's "weakspot" mode: draw N random words, take the
//     one whose letters have the worst score (ms + penalty for a mistake)
//   - Adaptive: this project's engine (softmax over letter difficulty),
//     a whole exercise of ExerciseWords words at once (Generator.Next)
//   - Stream:   the same engine as the app uses it now: short portions built
//     while the user types (Generator.Portion), mistyped words come back
//
// The result is how many words each strategy needs until the typist is
// TRULY good at every letter (judged by the hidden values, not by the model),
// reported in exercises of ExerciseWords words so the strategies compare.
//
// The typist is made up. Its numbers are in internal/config and must be
// reported as assumptions; the simulation compares strategies under the
// same assumptions, it does not predict real people.
package sim

import (
	"fmt"
	"math"
	"math/rand"
	"strings"

	"typingtrainer/internal/engine"
)

// Params describe the simulated typist and the experiment.
type Params struct {
	ErrMin, ErrMax   float64 // starting hidden error probability of a letter: uniform in this range
	TimeMin, TimeMax float64 // starting hidden time per press, ms: uniform in this range
	ErrFloor         float64 // the best error probability practice can reach
	TimeFloor        float64 // the best time practice can reach, ms
	LearnRate        float64 // each press closes this share of the gap to the floor
	TimeNoise        float64 // a press takes time * (1 ± TimeNoise), uniform

	// The experienced typist of RunOpen: starting values drawn from these ranges.
	ExpertErrMax                 float64 // error probability: uniform in ErrFloor..ExpertErrMax
	ExpertTimeMin, ExpertTimeMax float64 // time per press, ms
	OpenExercises                int     // exercises RunOpen measures
	FirstExercises               int     // Run measures variety over this many first exercises

	Runs         int // simulated typists per strategy (different seeds)
	MaxExercises int // give up after this many exercises

	BestOf        int     // BestOfN: random words compared per slot (monkeytype: 20)
	MissPenaltyMs float64 // BestOfN: a mistake adds this to the press time (monkeytype: 5000)
	ScoreWindow   int     // BestOfN: EMA over about this many presses (monkeytype: 50)
}

// Typist is the hidden truth about one simulated person.
type Typist struct {
	err  map[string]float64 // probability of a mistake on the letter
	time map[string]float64 // mean time per press, ms
	rng  *rand.Rand         // noise of each press
	p    Params
}

// NewTypist draws the starting values of every letter from rng.
// It is a template: practise with a Clone, which has its own noise source.
func NewTypist(letters []string, p Params, rng *rand.Rand) *Typist {
	t := &Typist{err: map[string]float64{}, time: map[string]float64{}, p: p}
	for _, c := range letters {
		t.err[c] = p.ErrMin + rng.Float64()*(p.ErrMax-p.ErrMin)
		t.time[c] = p.TimeMin + rng.Float64()*(p.TimeMax-p.TimeMin)
	}
	return t
}

// NewExpert draws an experienced typist: every letter already near the goal.
func NewExpert(letters []string, p Params, rng *rand.Rand) *Typist {
	q := p
	q.ErrMin, q.ErrMax = p.ErrFloor, p.ExpertErrMax
	q.TimeMin, q.TimeMax = p.ExpertTimeMin, p.ExpertTimeMax
	t := NewTypist(letters, q, rng)
	t.p = p
	return t
}

// Clone returns an identical typist with its own noise source, so every
// strategy can be tested on the same person.
func (t *Typist) Clone(rng *rand.Rand) *Typist {
	c := &Typist{err: map[string]float64{}, time: map[string]float64{}, rng: rng, p: t.p}
	for k, v := range t.err {
		c.err[k] = v
	}
	for k, v := range t.time {
		c.time[k] = v
	}
	return c
}

// Type types a text and returns what the browser would send: one sample
// per letter (spaces are skipped). Practising a letter improves it:
//
//	value = floor + (value - floor) * (1 - LearnRate)
//
// so the gap to the best possible value shrinks by the same share each time
// (exponential learning curve).
func (t *Typist) Type(text string) []engine.Sample { return t.typeText(text, true) }

// TypeMore types a text that continues the previous one (the stream): its
// first press is timed like any other.
func (t *Typist) TypeMore(text string) []engine.Sample { return t.typeText(text, false) }

func (t *Typist) typeText(text string, first bool) []engine.Sample {
	var out []engine.Sample
	for _, r := range text {
		if r == ' ' {
			continue
		}
		c := string(r)
		smp := engine.Sample{Char: c}
		if t.rng.Float64() < t.err[c] {
			smp.Errors = 1
		}
		if !first { // the first press of an exercise has no previous press
			smp.Ms = t.time[c] * (1 + t.p.TimeNoise*(2*t.rng.Float64()-1))
		}
		first = false
		out = append(out, smp)

		t.err[c] = t.p.ErrFloor + (t.err[c]-t.p.ErrFloor)*(1-t.p.LearnRate)
		t.time[c] = t.p.TimeFloor + (t.time[c]-t.p.TimeFloor)*(1-t.p.LearnRate)
	}
	return out
}

// Skilled reports whether the hidden values of every letter meet the
// mastery goal of the engine (MasteryErrorRate and TargetWPM).
func (t *Typist) Skilled(ep engine.Params) bool {
	for c, e := range t.err {
		if e > ep.MasteryErrorRate || t.time[c] > ep.TargetMs() {
			return false
		}
	}
	return true
}

// Strategy chooses the text of the next exercise.
type Strategy interface {
	Name() string
	Text(stats map[string]engine.KeyStat, unlocked int) string
	Observe(samples []engine.Sample) // sees what was typed (only BestOfN needs it)
}

// Adaptive is the project's own generator.
type Adaptive struct {
	Gen *engine.Generator
	EP  engine.Params
}

func (a *Adaptive) Name() string { return "adaptive (softmax)" }
func (a *Adaptive) Text(stats map[string]engine.KeyStat, unlocked int) string {
	return a.Gen.Next(stats, unlocked, a.EP).Text
}
func (a *Adaptive) Observe([]engine.Sample) {}

// Stream is the engine as the app uses it: rounds of RoundPortions
// portions. AheadPortions portions wait after the one being typed, so a new
// portion sees the statistics of everything typed except those waiting
// portions, exactly as in the browser. Words typed with a mistake come back
// in the next portion that is built. A new round starts from scratch (no
// waiting portions, no recent words), as a new round in the browser does.
type Stream struct {
	Gen    *engine.Generator
	EP     engine.Params
	queue  []string // portions built but not typed yet
	recent []string // words of the round so far
	retry  []string // mistyped words of the portion just typed
	typing string   // the portion being typed
	built  int      // portions built in this round
	typed  int      // portions handed out in this round
}

// RoundStart reports whether the text from the last Text call opened a
// round (its first press has no previous press, so it is not timed).
func (s *Stream) RoundStart() bool { return s.typed == 1 }

func (s *Stream) Name() string { return "stream (portions)" }
func (s *Stream) Text(stats map[string]engine.KeyStat, unlocked int) string {
	if s.typed == s.EP.RoundPortions { // the round is over: a new one
		s.queue, s.recent, s.retry, s.built, s.typed = nil, nil, nil, 0, 0
	}
	for len(s.queue) < s.EP.AheadPortions+1 && s.built < s.EP.RoundPortions {
		s.built++
		por := s.Gen.Portion(stats, unlocked, s.recent, s.retry, s.EP)
		s.retry = nil
		s.recent = append(s.recent, por.Words...)
		if len(s.recent) > 2*s.EP.RecentWords { // keep the list short; Portion uses the end only
			s.recent = s.recent[len(s.recent)-s.EP.RecentWords:]
		}
		s.queue = append(s.queue, strings.Join(por.Words, " "))
	}
	s.typing, s.queue = s.queue[0], s.queue[1:]
	s.typed++
	return s.typing
}

// Observe finds the words of the typed portion that had a mistake. The
// samples have no spaces: one sample per letter, in text order.
func (s *Stream) Observe(samples []engine.Sample) {
	i := 0
	for _, w := range strings.Fields(s.typing) {
		n := len([]rune(w))
		for _, smp := range samples[i:min(i+n, len(samples))] {
			if smp.Errors > 0 {
				s.retry = append(s.retry, w)
				break
			}
		}
		i += n
	}
}

// Random picks open words uniformly, never the same word twice in a row.
type Random struct {
	Gen   *engine.Generator
	Words int // words per exercise
	Rng   *rand.Rand
}

func (s *Random) Name() string { return "random words" }
func (s *Random) Text(_ map[string]engine.KeyStat, unlocked int) string {
	return pick(s.Gen.Words(unlocked), s.Words, s.Rng, func(cands []string) string {
		return cands[s.Rng.Intn(len(cands))]
	})
}
func (s *Random) Observe([]engine.Sample) {}

// BestOfN copies monkeytype's "weakspot" mode (frontend/src/ts/test/weak-spot.ts).
// Every letter has a score: an EMA of (press time + MissPenaltyMs if wrong).
// For each word slot it draws N random words and keeps the one with the
// highest mean letter score. Letters without a score are left out of the mean.
type BestOfN struct {
	Gen    *engine.Generator
	Words  int
	Rng    *rand.Rand
	P      Params
	score  map[string]float64
	scored map[string]int
}

func (s *BestOfN) Name() string { return fmt.Sprintf("best of %d (monkeytype)", s.P.BestOf) }

func (s *BestOfN) Text(_ map[string]engine.KeyStat, unlocked int) string {
	return pick(s.Gen.Words(unlocked), s.Words, s.Rng, func(cands []string) string {
		best, bestScore := "", -1.0
		for i := 0; i < s.P.BestOf; i++ {
			w := cands[s.Rng.Intn(len(cands))]
			if sc := s.wordScore(w); best == "" || sc > bestScore {
				best, bestScore = w, sc
			}
		}
		return best
	})
}

func (s *BestOfN) wordScore(w string) float64 {
	total, n := 0.0, 0
	for _, r := range w {
		if k := s.scored[string(r)]; k > 0 {
			total += s.score[string(r)]
			n++
		}
	}
	if n == 0 {
		return 0
	}
	return total / float64(n)
}

// Observe updates the scores. Like monkeytype, a press without a measured
// time (the first one) is skipped.
func (s *BestOfN) Observe(samples []engine.Sample) {
	if s.score == nil {
		s.score, s.scored = map[string]float64{}, map[string]int{}
	}
	for _, smp := range samples {
		if smp.Ms == 0 {
			continue
		}
		x := smp.Ms
		if smp.Errors > 0 {
			x += s.P.MissPenaltyMs
		}
		if s.scored[smp.Char] < s.P.ScoreWindow {
			s.scored[smp.Char]++
		}
		a := 1 / float64(s.scored[smp.Char])
		s.score[smp.Char] = x*a + s.score[smp.Char]*(1-a)
	}
}

// pick fills an exercise with `n` words chosen by choose, avoiding the same
// word twice in a row when there is more than one word.
func pick(cands []string, n int, rng *rand.Rand, choose func([]string) string) string {
	if len(cands) == 0 {
		return ""
	}
	out := make([]string, 0, n)
	for len(out) < n {
		w := choose(cands)
		if len(out) > 0 && w == out[len(out)-1] && len(cands) > 1 {
			continue
		}
		out = append(out, w)
	}
	return strings.Join(out, " ")
}

// Result of one simulated typist with one strategy. Everything is counted in
// exercises of ExerciseWords words, also for the stream (words typed / 20).
type Result struct {
	Exercises int     // exercises until the typist was skilled at every letter
	Reached   bool    // false = gave up after MaxExercises
	AllOpenAt int     // exercise after which every letter was unlocked (0 = never)
	Variety   Variety // over the first FirstExercises exercises (the first lessons)
}

// typeNext lets the typist type the strategy's next text. Inside a round of
// the stream the typing goes on without a break, so only the first press of
// a round is untimed.
func typeNext(s Strategy, t *Typist, text string) []engine.Sample {
	if st, stream := s.(*Stream); stream && !st.RoundStart() {
		return t.TypeMore(text)
	}
	return t.Type(text)
}

// Run lets one typist practise with one strategy until it is skilled at every
// letter or MaxExercises is reached. After each text (an exercise, or a
// portion of the stream) the statistics and the unlocked count are updated
// exactly as the real API does.
func Run(gen *engine.Generator, s Strategy, t *Typist, ep engine.Params, p Params) Result {
	stats := map[string]engine.KeyStat{}
	unlocked := gen.Start()
	res := Result{}
	v := variety{size: ep.ExerciseWords}
	exercises := func(words int) int { return (words + ep.ExerciseWords - 1) / ep.ExerciseWords }
	for words := 0; words < p.MaxExercises*ep.ExerciseWords; {
		text := s.Text(stats, unlocked)
		if len(text) == 0 {
			break
		}
		if v.n < p.FirstExercises {
			v.add(text)
		}
		samples := typeNext(s, t, text)
		words += len(strings.Fields(text))
		s.Observe(samples)
		stats = engine.Apply(stats, samples, ep)
		unlocked = gen.NextUnlocked(stats, unlocked, ep)
		if res.AllOpenAt == 0 && unlocked == len(gen.Order()) {
			res.AllOpenAt = exercises(words)
		}
		if res.AllOpenAt > 0 && t.Skilled(ep) {
			res.Exercises, res.Reached = exercises(words), true
			res.Variety = v.result()
			return res
		}
	}
	res.Exercises = p.MaxExercises
	res.Variety = v.result()
	return res
}

// Variety says how repetitive the exercises feel. All values are means over
// exercises (blocks of ExerciseWords words, also in the stream), from 0 to 1.
type Variety struct {
	Distinct float64 // share of different words in one exercise (1 = no word twice)
	Repeated float64 // share of words that were also in the previous exercise
	TopShare float64 // share of words that contain the exercise's most common letter
}

// RunOpen measures variety the way an experienced typist meets it: every
// letter is open from the start (the "I can already touch type" choice), and
// the typist practises n exercises (n * ExerciseWords words). Here any
// repetition is the strategy's own choice, not forced by a small alphabet.
func RunOpen(gen *engine.Generator, s Strategy, t *Typist, ep engine.Params, n int) Variety {
	stats := map[string]engine.KeyStat{}
	all := len(gen.Order())
	v := variety{size: ep.ExerciseWords}
	for words := 0; words < n*ep.ExerciseWords; {
		text := s.Text(stats, all)
		if len(text) == 0 {
			break
		}
		v.add(text)
		samples := typeNext(s, t, text)
		words += len(strings.Fields(text))
		s.Observe(samples)
		stats = engine.Apply(stats, samples, ep)
	}
	return v.result()
}

// variety sums the variety numbers over exercises. The words of the texts
// are collected and measured in blocks of `size` words, so a strategy that
// gives a few words at a time (the stream) is measured like 20-word exercises.
type variety struct {
	size                    int
	buf                     []string // words not measured yet
	n                       int
	distinct, repeated, top float64
	prev                    map[string]bool
}

func (v *variety) add(text string) {
	v.buf = append(v.buf, strings.Fields(text)...)
	for len(v.buf) >= v.size && v.size > 0 {
		v.block(v.buf[:v.size])
		v.buf = v.buf[v.size:]
	}
}

func (v *variety) block(words []string) {
	cur := map[string]bool{}
	again := 0
	for _, w := range words {
		cur[w] = true
		if v.prev[w] {
			again++
		}
	}
	v.distinct += float64(len(cur)) / float64(len(words))
	inWords := map[rune]int{} // how many words contain each letter
	best := 0
	for _, w := range words {
		seen := map[rune]bool{}
		for _, r := range w {
			if !seen[r] {
				seen[r] = true
				inWords[r]++
				if inWords[r] > best {
					best = inWords[r]
				}
			}
		}
	}
	v.top += float64(best) / float64(len(words))
	if v.prev != nil {
		v.repeated += float64(again) / float64(len(words))
	}
	v.n++
	v.prev = cur
}

// result returns the averages (NaN without data). The first exercise has no
// previous one, so Repeated is averaged over one exercise fewer.
func (v *variety) result() Variety {
	if v.n == 0 {
		return Variety{math.NaN(), math.NaN(), math.NaN()}
	}
	out := Variety{
		Distinct: v.distinct / float64(v.n),
		Repeated: math.NaN(),
		TopShare: v.top / float64(v.n),
	}
	if v.n > 1 {
		out.Repeated = v.repeated / float64(v.n-1)
	}
	return out
}
