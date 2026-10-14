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
//   - Adaptive: this project's engine (softmax over letter difficulty)
//
// The result is how many exercises each strategy needs until the typist is
// TRULY good at every letter (judged by the hidden values, not by the model).
//
// The typist is made up. Its numbers are in internal/config and must be
// reported as assumptions; the simulation compares strategies under the
// same assumptions, it does not predict real people.
package sim

import (
	"fmt"
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
func (t *Typist) Type(text string) []engine.Sample {
	var out []engine.Sample
	first := true
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

// Result of one simulated typist with one strategy.
type Result struct {
	Exercises int  // exercises until the typist was skilled at every letter
	Reached   bool // false = gave up after MaxExercises
	AllOpenAt int  // exercise after which every letter was unlocked (0 = never)
}

// Run lets one typist practise with one strategy until it is skilled at every
// letter or MaxExercises is reached. After each exercise the statistics and
// the unlocked count are updated exactly as the real API does.
func Run(gen *engine.Generator, s Strategy, t *Typist, ep engine.Params, p Params) Result {
	stats := map[string]engine.KeyStat{}
	unlocked := gen.Start()
	res := Result{}
	for ex := 1; ex <= p.MaxExercises; ex++ {
		samples := t.Type(s.Text(stats, unlocked))
		s.Observe(samples)
		stats = engine.Apply(stats, samples, ep)
		unlocked = gen.NextUnlocked(stats, unlocked, ep)
		if res.AllOpenAt == 0 && unlocked == len(gen.Order()) {
			res.AllOpenAt = ex
		}
		if res.AllOpenAt > 0 && t.Skilled(ep) {
			res.Exercises, res.Reached = ex, true
			return res
		}
	}
	res.Exercises = p.MaxExercises
	return res
}
