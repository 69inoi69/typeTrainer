package sim_test

import (
	"math"
	"math/rand"
	"strings"
	"testing"

	"typingtrainer/internal/config"
	"typingtrainer/internal/engine"
	"typingtrainer/internal/sim"
)

var cfg = config.Default()

func newTypist(letters []string, seed int64) *sim.Typist {
	t := sim.NewTypist(letters, cfg.Sim, rand.New(rand.NewSource(seed)))
	return t.Clone(rand.New(rand.NewSource(seed + 1)))
}

func TestTypist_SamplesSkipSpacesAndFirstPress(t *testing.T) {
	ty := newTypist([]string{"a", "b"}, 1)
	s := ty.Type("ab ba")
	if len(s) != 4 {
		t.Fatalf("want 4 samples (no spaces), got %d", len(s))
	}
	if s[0].Ms != 0 {
		t.Errorf("first press of an exercise must not be timed, got %v", s[0].Ms)
	}
	for _, smp := range s[1:] {
		if smp.Ms <= 0 {
			t.Errorf("later presses must be timed: %+v", smp)
		}
	}
}

func TestTypist_PracticeMakesSkilled(t *testing.T) {
	ty := newTypist([]string{"a"}, 1)
	if ty.Skilled(cfg.Engine) {
		t.Skip("this seed starts skilled; the test needs a weak letter")
	}
	ty.Type(strings.Repeat("a", 500))
	if !ty.Skilled(cfg.Engine) {
		t.Fatal("500 presses should bring any letter to the goal")
	}
}

func TestTypist_NoLetterNoSkill(t *testing.T) {
	ty := newTypist([]string{"a", "q"}, 1)
	ty.Type(strings.Repeat("a", 1000)) // q never practised
	if ty.Skilled(cfg.Engine) {
		t.Fatal("a letter that was never practised cannot meet the goal")
	}
}

func TestBestOfN_PrefersWorstScore(t *testing.T) {
	words := []string{"ab", "ba", "aa", "bb", "az", "za"}
	gen := engine.NewGenerator(words, rand.New(rand.NewSource(1)), cfg.Engine)
	s := &sim.BestOfN{Gen: gen, Words: 100, Rng: rand.New(rand.NewSource(2)), P: cfg.Sim}
	// z is slow and wrong, a and b are fast and clean
	var samples []engine.Sample
	for i := 0; i < 30; i++ {
		samples = append(samples,
			engine.Sample{Char: "a", Ms: 200}, engine.Sample{Char: "b", Ms: 200},
			engine.Sample{Char: "z", Ms: 900, Errors: 1})
	}
	s.Observe(samples)
	text := s.Text(nil, len(gen.Order()))
	withZ := 0
	for _, w := range strings.Fields(text) {
		if strings.Contains(w, "z") {
			withZ++
		}
	}
	// 2 of 6 words have z; a uniform choice would give about 33 of 100
	if withZ < 90 {
		t.Fatalf("best of 20 should almost always pick a word with z, got %d/100", withZ)
	}
}

func TestBestOfN_UntimedPressesHaveNoScore(t *testing.T) {
	words := []string{"ab", "ba"}
	gen := engine.NewGenerator(words, rand.New(rand.NewSource(1)), cfg.Engine)
	s := &sim.BestOfN{Gen: gen, Words: 10, Rng: rand.New(rand.NewSource(2)), P: cfg.Sim}
	s.Observe([]engine.Sample{{Char: "a", Ms: 0, Errors: 1}})
	if got := s.Text(nil, 2); len(strings.Fields(got)) != 10 {
		t.Fatalf("want 10 words, got %q", got)
	}
}

func TestRun_EveryStrategyReachesTheGoal(t *testing.T) {
	words := strings.Fields(`the then than tan ant net ten hen eat tea ate heat hat that
		tent neat hate thee teeth near earn tear rate hear art rat tar her here there`)
	p := cfg.Sim
	p.MaxExercises = 2000
	for k := 0; k < 4; k++ {
		gen := engine.NewGenerator(words, rand.New(rand.NewSource(1)), cfg.Engine)
		rng := rand.New(rand.NewSource(3))
		strategies := []sim.Strategy{
			&sim.Random{Gen: gen, Words: cfg.Engine.ExerciseWords, Rng: rng},
			&sim.BestOfN{Gen: gen, Words: cfg.Engine.ExerciseWords, Rng: rng, P: p},
			&sim.Adaptive{Gen: gen, EP: cfg.Engine},
			&sim.Stream{Gen: gen, EP: cfg.Engine},
		}
		s := strategies[k]
		res := sim.Run(gen, s, newTypist(gen.Order(), 5), cfg.Engine, p)
		if !res.Reached || res.AllOpenAt == 0 || res.AllOpenAt > res.Exercises {
			t.Errorf("%s: %+v", s.Name(), res)
		}
	}
}

func TestRun_GivesUp(t *testing.T) {
	words := []string{"ab", "ba", "abba"}
	gen := engine.NewGenerator(words, rand.New(rand.NewSource(1)), cfg.Engine)
	p := cfg.Sim
	p.MaxExercises = 1
	res := sim.Run(gen, &sim.Adaptive{Gen: gen, EP: cfg.Engine}, newTypist(gen.Order(), 1), cfg.Engine, p)
	if res.Reached || res.Exercises != 1 {
		t.Fatalf("one exercise cannot be enough: %+v", res)
	}
}

// fixed returns the same texts in turn: a strategy for testing the variety numbers.
type fixed struct {
	texts []string
	i     int
}

func (f *fixed) Name() string { return "fixed" }
func (f *fixed) Text(map[string]engine.KeyStat, int) string {
	t := f.texts[f.i%len(f.texts)]
	f.i++
	return t
}
func (f *fixed) Observe([]engine.Sample) {}

func TestRunOpen_Variety(t *testing.T) {
	words := []string{"ab", "ba", "bb", "aa"}
	gen := engine.NewGenerator(words, rand.New(rand.NewSource(1)), cfg.Engine)
	s := &fixed{texts: []string{"ab ab ba bb", "ab aa aa aa"}}
	ep := cfg.Engine
	ep.ExerciseWords = 4 // one text = one exercise
	v := sim.RunOpen(gen, s, newTypist(gen.Order(), 1), ep, 2)
	// exercise 1: 3 different of 4 words; exercise 2: 2 of 4
	if !near(v.Distinct, (0.75+0.5)/2) {
		t.Errorf("Distinct = %v", v.Distinct)
	}
	// exercise 2: only "ab" (1 of 4 words) was in exercise 1
	if !near(v.Repeated, 0.25) {
		t.Errorf("Repeated = %v", v.Repeated)
	}
	// exercise 1: b is in all 4 words; exercise 2: a is in all 4 words
	if !near(v.TopShare, 1) {
		t.Errorf("TopShare = %v", v.TopShare)
	}
	if !near(v.Letters, 2) { // every word has 2 letters
		t.Errorf("Letters = %v", v.Letters)
	}
}

// Run reports the mean word length over everything typed.
func TestRun_Letters(t *testing.T) {
	gen := engine.NewGenerator([]string{"ab", "ba", "abba"}, rand.New(rand.NewSource(1)), cfg.Engine)
	p := cfg.Sim
	p.MaxExercises = 1
	ep := cfg.Engine
	ep.ExerciseWords = 3
	res := sim.Run(gen, &fixed{texts: []string{"ab abba ab"}}, newTypist(gen.Order(), 1), ep, p)
	if !near(res.Letters, 8.0/3) {
		t.Fatalf("Letters = %v, want 8/3", res.Letters)
	}
}

func TestRunOpen_NoExercisesIsNaN(t *testing.T) {
	gen := engine.NewGenerator([]string{"ab"}, rand.New(rand.NewSource(1)), cfg.Engine)
	v := sim.RunOpen(gen, &fixed{texts: []string{"ab"}}, newTypist(gen.Order(), 1), cfg.Engine, 0)
	if !math.IsNaN(v.Distinct) || !math.IsNaN(v.Repeated) || !math.IsNaN(v.TopShare) || !math.IsNaN(v.Letters) {
		t.Fatalf("no data must give NaN, got %+v", v)
	}
}

// The stream measures variety in blocks of ExerciseWords words, whatever
// the size of its portions.
func TestRunOpen_StreamIsMeasuredInBlocks(t *testing.T) {
	words := []string{"ab", "ba", "bb", "aa"}
	gen := engine.NewGenerator(words, rand.New(rand.NewSource(1)), cfg.Engine)
	s := &fixed{texts: []string{"ab ba", "bb aa"}} // 2 words per text
	ep := cfg.Engine
	ep.ExerciseWords = 4
	v := sim.RunOpen(gen, s, newTypist(gen.Order(), 1), ep, 2)
	// two blocks "ab ba bb aa": all different, and all in the previous block
	if !near(v.Distinct, 1) || !near(v.Repeated, 1) {
		t.Fatalf("got %+v", v)
	}
}

func TestStream_MistypedWordsComeBack(t *testing.T) {
	words := strings.Fields("the then than tan ant net ten hen eat tea ate heat hat that")
	gen := engine.NewGenerator(words, rand.New(rand.NewSource(1)), cfg.Engine)
	s := &sim.Stream{Gen: gen, EP: cfg.Engine}
	first := strings.Fields(s.Text(nil, len(gen.Order())))
	// every letter of the first word wrong, the rest clean
	var samples []engine.Sample
	for i, w := range first {
		for _, r := range w {
			smp := engine.Sample{Char: string(r), Ms: 300}
			if i == 0 {
				smp.Errors = 1
			}
			samples = append(samples, smp)
		}
	}
	s.Observe(samples)
	found := false
	for i := 0; i < cfg.Engine.AheadPortions+1; i++ {
		for _, w := range strings.Fields(s.Text(nil, len(gen.Order()))) {
			found = found || w == first[0]
		}
	}
	if !found {
		t.Fatalf("%q was mistyped but did not come back", first[0])
	}
}

// A round of the stream is RoundPortions portions; then a new round starts.
func TestStream_Rounds(t *testing.T) {
	words := strings.Fields("the then than tan ant net ten hen eat tea ate heat hat that")
	gen := engine.NewGenerator(words, rand.New(rand.NewSource(1)), cfg.Engine)
	s := &sim.Stream{Gen: gen, EP: cfg.Engine}
	for i := 0; i < 2*cfg.Engine.RoundPortions; i++ {
		s.Text(nil, len(gen.Order()))
		if want := i%cfg.Engine.RoundPortions == 0; s.RoundStart() != want {
			t.Fatalf("portion %d: RoundStart = %v, want %v", i, s.RoundStart(), want)
		}
	}
}

func TestNewExpert_StartsNearTheGoal(t *testing.T) {
	letters := []string{"a", "b", "c", "d", "e"}
	ty := sim.NewExpert(letters, cfg.Sim, rand.New(rand.NewSource(1))).Clone(rand.New(rand.NewSource(2)))
	if !ty.Skilled(cfg.Engine) {
		t.Fatal("an expert drawn from the expert ranges meets the goal from the start")
	}
}

func near(a, b float64) bool { return math.Abs(a-b) < 1e-9 }
