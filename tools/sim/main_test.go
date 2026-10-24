package main

// The main claim of the product (and of the thesis): Learn's adaptive word
// choice teaches faster than random open words, the "?group=random" A/B
// group of the app. The test runs the simulation (internal/sim,
// docs/ALGORITHM.md section 10) on the real word lists, with the same
// typists, the same seeds and the same unlocking rule for both, and checks
// that random words need several times more practice. If the algorithm
// ever stops beating random, this fails before any real person notices.

import (
	"math/rand"
	"os"
	"strconv"
	"testing"

	"typingtrainer/internal/config"
	"typingtrainer/internal/engine"
	"typingtrainer/internal/language"
	"typingtrainer/internal/layout"
	"typingtrainer/internal/sim"
)

// Random words must need at least this many times the exercises of the
// stream. Measured when the test was written: 8 to 22 times (a Russian
// random run once never reached the goal); 3 leaves room for other typists
// or a small change of the engine numbers, and still means "clearly
// better", not "a little better".
const minGain = 3

// Typists per language: enough to see that the result is not one lucky
// person, few enough to keep go test fast (a run takes under a second).
const typists = 3

// Strategy numbers of strategy() in main.go.
const (
	kRandom = 0
	kStream = 3 // the app's Learn: portions while you type
)

func TestAdaptiveBeatsRandom(t *testing.T) {
	cfg := config.Default()
	data, err := os.ReadFile("../../data/languages.json")
	if err != nil {
		t.Fatal(err)
	}
	langs, err := language.Parse(data)
	if err != nil {
		t.Fatal(err)
	}
	for _, l := range langs {
		t.Run(l.ID, func(t *testing.T) {
			t.Parallel()
			list, err := os.ReadFile("../../data/langs/" + l.ID + "/words.txt")
			if err != nil {
				t.Fatal(err)
			}
			layoutJSON, err := os.ReadFile("../../data/layouts/" + l.Layout + ".json")
			if err != nil {
				t.Fatal(err)
			}
			lay, err := layout.Parse(layoutJSON)
			if err != nil {
				t.Fatal(err)
			}
			words, home := l.Words(string(list)), lay.RestingKeys()

			for seed := int64(1); seed <= typists; seed++ {
				stream := runOne(kStream, seed, words, home, cfg)
				random := runOne(kRandom, seed, words, home, cfg)
				t.Logf("%s, typist %d: stream %d exercises, random %s", l.ID, seed, stream.Exercises, exercisesText(random, cfg))
				if !stream.Reached {
					t.Errorf("typist %d: the stream did not reach the goal in %d exercises", seed, cfg.Sim.MaxExercises)
					continue
				}
				// a random run that gives up counts as the cap: it needed at least that many
				if got := random.Exercises; got < minGain*stream.Exercises {
					t.Errorf("typist %d: random words needed %d exercises, the stream %d: less than %d times more",
						seed, got, stream.Exercises, minGain)
				}
			}
		})
	}
}

// runOne is one beginner under strategy k, set up exactly as runLanguage
// does it, so the test measures what go run ./tools/sim prints.
func runOne(k int, seed int64, words, home []string, cfg config.Config) sim.Result {
	ep := engineParams(k, cfg.Engine.Temperature, cfg)
	gen := engine.NewGenerator(words, rand.New(rand.NewSource(seed)), ep)
	gen.SetHome(home, ep)
	gen.SetWordParams(cfg.Words)
	typist := sim.NewTypist(gen.Order(), cfg.Sim, rand.New(rand.NewSource(seed))).
		Clone(rand.New(rand.NewSource(seed + 1000)))
	s := strategy(k, cfg.Engine.Temperature, gen, cfg, rand.New(rand.NewSource(seed+2000)))
	return sim.Run(gen, s, typist, ep, cfg.Sim)
}

func exercisesText(r sim.Result, cfg config.Config) string {
	if !r.Reached {
		return "did not reach the goal in " + strconv.Itoa(cfg.Sim.MaxExercises) + " exercises"
	}
	return strconv.Itoa(r.Exercises) + " exercises"
}
