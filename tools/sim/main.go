// Command sim runs the strategy simulation (internal/sim) on the real word
// lists and prints a table for the thesis. Run it from the repository root:
//
//	go run ./tools/sim              # all languages
//	go run ./tools/sim -lang en     # one language
//
// It is a research tool, not part of the app: it reads data/ from disk.
package main

import (
	"flag"
	"fmt"
	"math/rand"
	"os"
	"sort"

	"typingtrainer/internal/config"
	"typingtrainer/internal/engine"
	"typingtrainer/internal/language"
	"typingtrainer/internal/sim"
)

func main() {
	only := flag.String("lang", "", "language id (en, pl, uk, ru); empty = all")
	flag.Parse()
	cfg := config.Default()

	data, err := os.ReadFile("data/languages.json")
	if err != nil {
		fail(err)
	}
	langs, err := language.Parse(data)
	if err != nil {
		fail(err)
	}
	p := cfg.Sim
	fmt.Printf("%d simulated typists per strategy, %d words per exercise, give up after %d exercises\n",
		p.Runs, cfg.Engine.ExerciseWords, p.MaxExercises)
	for _, l := range langs {
		if *only != "" && l.ID != *only {
			continue
		}
		list, err := os.ReadFile("data/langs/" + l.ID + "/words.txt")
		if err != nil {
			fail(err)
		}
		runLanguage(l.ID, l.Words(string(list)), cfg)
	}
}

func runLanguage(id string, words []string, cfg config.Config) {
	ep, p := cfg.Engine, cfg.Sim
	fmt.Printf("\n%s (%d words)\n", id, len(words))
	fmt.Printf("%-26s %8s %8s %8s %12s\n", "strategy", "median", "mean", "reached", "all open at")
	for k := 0; k < 3; k++ {
		var res []sim.Result
		name := ""
		for run := 0; run < p.Runs; run++ {
			seed := int64(run + 1)
			// The same typist and the same random numbers for every strategy:
			// only the word choice differs.
			gen := engine.NewGenerator(words, rand.New(rand.NewSource(seed)), ep)
			template := sim.NewTypist(gen.Order(), p, rand.New(rand.NewSource(seed)))
			typist := template.Clone(rand.New(rand.NewSource(seed + 1000)))
			rng := rand.New(rand.NewSource(seed + 2000))
			var s sim.Strategy
			switch k {
			case 0:
				s = &sim.Random{Gen: gen, Words: ep.ExerciseWords, Rng: rng}
			case 1:
				s = &sim.BestOfN{Gen: gen, Words: ep.ExerciseWords, Rng: rng, P: p}
			case 2:
				s = &sim.Adaptive{Gen: gen, EP: ep}
			}
			name = s.Name()
			res = append(res, sim.Run(gen, s, typist, ep, p))
		}
		fmt.Println(row(name, res))
	}
}

// row summarises the runs of one strategy. Runs that gave up count as
// MaxExercises, so the mean is a lower bound when not every run reached the goal.
func row(name string, res []sim.Result) string {
	ex := make([]int, len(res))
	sum, reached, open, openN := 0, 0, 0, 0
	for i, r := range res {
		ex[i] = r.Exercises
		sum += r.Exercises
		if r.Reached {
			reached++
		}
		if r.AllOpenAt > 0 {
			open += r.AllOpenAt
			openN++
		}
	}
	sort.Ints(ex)
	median := float64(ex[len(ex)/2])
	if len(ex)%2 == 0 {
		median = float64(ex[len(ex)/2-1]+ex[len(ex)/2]) / 2
	}
	openStr := "never"
	if openN > 0 {
		openStr = fmt.Sprintf("%.0f", float64(open)/float64(openN))
	}
	return fmt.Sprintf("%-26s %8.0f %8.0f %5d/%-2d %12s",
		name, median, float64(sum)/float64(len(res)), reached, len(res), openStr)
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
