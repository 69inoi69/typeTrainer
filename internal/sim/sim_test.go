package sim_test

import (
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
	for k := 0; k < 3; k++ {
		gen := engine.NewGenerator(words, rand.New(rand.NewSource(1)), cfg.Engine)
		rng := rand.New(rand.NewSource(3))
		strategies := []sim.Strategy{
			&sim.Random{Gen: gen, Words: cfg.Engine.ExerciseWords, Rng: rng},
			&sim.BestOfN{Gen: gen, Words: cfg.Engine.ExerciseWords, Rng: rng, P: p},
			&sim.Adaptive{Gen: gen, EP: cfg.Engine},
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
