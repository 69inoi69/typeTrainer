// Command sim runs the strategy simulation (internal/sim) on the real word
// lists and prints a table of the results. Run it from the repository root:
//
//	go run ./tools/sim              # all languages
//	go run ./tools/sim -lang en     # one language
//	go run ./tools/sim -temps 0.1,0.25   # try other temperatures (experiment only)
//	go run ./tools/sim -floor 0 -ramp 0  # other WordParams (experiment only)
//
// It is a research tool, not part of the app: it reads data/ from disk.
// The numbers it uses come from internal/config (Engine, Words, Sim); the
// flags only override them for an experiment. What the columns mean and
// how to read the results is in docs/ALGORITHM.md, section 10.
//
// To add a column (a new metric): compute it in internal/sim (Result or
// Variety), add its title to both header lines in runLanguage, and print it
// in row or pct.
package main

import (
	"flag"
	"fmt"
	"math"
	"math/rand"
	"os"
	"sort"
	"strconv"
	"strings"

	"typingtrainer/internal/config"
	"typingtrainer/internal/engine"
	"typingtrainer/internal/language"
	"typingtrainer/internal/layout"
	"typingtrainer/internal/sim"
)

func main() {
	only := flag.String("lang", "", "language id (en, pl, uk, ru); empty = all")
	temps := flag.String("temps", "", "comma-separated temperatures to try for the adaptive\n"+
		"strategy instead of the configured one, e.g. 0.1,0.25 (experiment only)")
	floor := flag.Int("floor", -1, "FloorWords instead of the configured one (experiment only)")
	ramp := flag.Float64("ramp", -1, "RampLetters instead of the configured one (experiment only)")
	flag.Parse()
	cfg := config.Default()
	if *floor >= 0 {
		cfg.Words.FloorWords = *floor
	}
	if *ramp >= 0 {
		cfg.Words.RampLetters = *ramp
	}

	ts := []float64{cfg.Engine.Temperature}
	if *temps != "" {
		ts = nil
		for _, f := range strings.Split(*temps, ",") {
			v, err := strconv.ParseFloat(strings.TrimSpace(f), 64)
			if err != nil || v <= 0 {
				fail(fmt.Errorf("bad temperature %q", f))
			}
			ts = append(ts, v)
		}
	}

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
	fmt.Printf("stream: portions of %d words, %d waiting; counted in exercises of %d words\n",
		cfg.Engine.PortionWords, cfg.Engine.AheadPortions, cfg.Engine.ExerciseWords)
	fmt.Printf("beginner: exercises until every letter meets the goal; variety of the first %d exercises\n", p.FirstExercises)
	fmt.Printf("expert: all letters open from the start, variety over %d exercises\n", p.OpenExercises)
	fmt.Printf("word limit: %d words until every letter is open, then the whole list over %g letters;\n"+
		"each focus letter gets at least %d words freely\n", cfg.Engine.RankStart, cfg.Words.RampLetters, cfg.Words.FloorWords)
	fmt.Printf("variety: dist = share of different words in an exercise, rep = share of words also in\n" +
		"the previous exercise, top = share of words containing the exercise's most common letter,\n" +
		"len = mean letters per word (before |: over the whole run until the goal),\n" +
		"rank = mean place of the words in the frequency list (0 = most common),\n" +
		"after = mean rank of the words typed after every letter was open, until the goal\n")
	for _, l := range langs {
		if *only != "" && l.ID != *only {
			continue
		}
		list, err := os.ReadFile("data/langs/" + l.ID + "/words.txt")
		if err != nil {
			fail(err)
		}
		layoutJSON, err := os.ReadFile("data/layouts/" + l.Layout + ".json")
		if err != nil {
			fail(err)
		}
		lay, err := layout.Parse(layoutJSON)
		if err != nil {
			fail(err)
		}
		runLanguage(l.ID, l.Words(string(list)), lay.RestingKeys(), cfg, ts)
	}
}

// strategy builds a fresh strategy for one run (k: 0 random, 1 best of N,
// 2 adaptive with temperature t, 3 the stream with temperature t, 4 the
// stream without the word frequency penalty, to show what the penalty changes).
// A fresh one each run, because the stream and best of N keep state.
//
// To add a strategy: a type in internal/sim, a new k here (and in
// engineParams if it needs other engine numbers), a job in runLanguage and
// its row name there.
func strategy(k int, t float64, gen *engine.Generator, cfg config.Config, rng *rand.Rand) sim.Strategy {
	switch k {
	case 0:
		return &sim.Random{Gen: gen, Words: cfg.Engine.ExerciseWords, Rng: rng}
	case 1:
		return &sim.BestOfN{Gen: gen, Words: cfg.Engine.ExerciseWords, Rng: rng, P: cfg.Sim}
	}
	ep := engineParams(k, t, cfg)
	if k >= 3 {
		return &sim.Stream{Gen: gen, EP: ep}
	}
	return &sim.Adaptive{Gen: gen, EP: ep}
}

// engineParams are the engine numbers of strategy k: the configured ones,
// with temperature t for the engine strategies and no frequency penalty for 4.
func engineParams(k int, t float64, cfg config.Config) engine.Params {
	ep := cfg.Engine
	if k >= 2 {
		ep.Temperature = t
	}
	if k == 4 {
		ep.RankPenalty = 0 // outside (0, 1) = off
	}
	return ep
}

// runLanguage prints the table of one language: one row per strategy (and
// per temperature for the engine strategies), each the summary of p.Runs
// beginners (Run) and p.Runs experts (RunOpen). home: the resting keys of
// the language's layout, put first in the unlock order as in the app.
func runLanguage(id string, words, home []string, cfg config.Config, temps []float64) {
	p := cfg.Sim
	fmt.Printf("\n%s (%d words)\n", id, len(words))
	fmt.Printf("%-22s %6s %6s %7s %5s %4s %5s | %-29s | %-29s\n", "", "", "", "", "", "", "", "beginner, first", "expert")
	fmt.Printf("%-22s %6s %6s %7s %5s %4s %5s | %5s %5s %5s %5s %5s | %5s %5s %5s %5s %5s\n",
		"strategy", "median", "mean", "reached", "open", "len", "after",
		"dist", "rep", "top", "len", "rank", "dist", "rep", "top", "len", "rank")
	type job struct {
		k int
		t float64
	}
	jobs := []job{{0, 0}, {1, 0}}
	for _, t := range temps {
		jobs = append(jobs, job{2, t})
	}
	for _, t := range temps {
		jobs = append(jobs, job{3, t})
	}
	for _, t := range temps {
		jobs = append(jobs, job{4, t})
	}
	for _, j := range jobs {
		ep := engineParams(j.k, j.t, cfg)
		var res []sim.Result
		var vs []sim.Variety
		name := ""
		for run := 0; run < p.Runs; run++ {
			seed := int64(run + 1)
			// The same typist and the same random numbers for every strategy:
			// only the word choice differs. Different seed offsets (+1000 for
			// the typist's noise, +2000 for the strategy) keep the random
			// streams apart, so one part using more numbers does not change
			// what another part draws.
			gen := engine.NewGenerator(words, rand.New(rand.NewSource(seed)), ep)
			gen.SetHome(home, ep)
			gen.SetWordParams(cfg.Words)
			typist := sim.NewTypist(gen.Order(), p, rand.New(rand.NewSource(seed))).
				Clone(rand.New(rand.NewSource(seed + 1000)))
			s := strategy(j.k, j.t, gen, cfg, rand.New(rand.NewSource(seed+2000)))
			name = s.Name()
			res = append(res, sim.Run(gen, s, typist, ep, p))

			gen = engine.NewGenerator(words, rand.New(rand.NewSource(seed)), ep)
			gen.SetHome(home, ep)
			gen.SetWordParams(cfg.Words)
			expert := sim.NewExpert(gen.Order(), p, rand.New(rand.NewSource(seed))).
				Clone(rand.New(rand.NewSource(seed + 1000)))
			s = strategy(j.k, j.t, gen, cfg, rand.New(rand.NewSource(seed+2000)))
			vs = append(vs, sim.RunOpen(gen, s, expert, ep, p.OpenExercises))
		}
		if j.k == 2 {
			name = fmt.Sprintf("adaptive, T = %g", j.t)
		}
		if j.k == 3 {
			name = fmt.Sprintf("stream, T = %g", j.t)
		}
		if j.k == 4 {
			name = fmt.Sprintf("stream, no freq, %g", j.t)
		}
		fmt.Println(row(name, res, vs))
	}
	forecast(words, home, cfg)
}

// forecast prints how good the forecast of the Learn panel is for this
// language (sim.Forecasts): the stream with the configured numbers, p.Runs
// beginners, every forecast against the rounds the next letter really took.
func forecast(words, home []string, cfg config.Config) {
	p, ep, fp := cfg.Sim, cfg.Engine, cfg.Forecast
	var runs []sim.ForecastRun
	for run := 0; run < p.Runs; run++ {
		seed := int64(run + 1)
		gen := engine.NewGenerator(words, rand.New(rand.NewSource(seed)), ep)
		gen.SetHome(home, ep)
		gen.SetWordParams(cfg.Words)
		typist := sim.NewTypist(gen.Order(), p, rand.New(rand.NewSource(seed))).
			Clone(rand.New(rand.NewSource(seed + 1000)))
		rounds := p.MaxExercises * ep.ExerciseWords / (ep.PortionWords * ep.RoundPortions)
		runs = append(runs, sim.Forecasts(gen, &sim.Stream{Gen: gen, EP: ep}, typist, ep, fp, rounds))
	}
	s := sim.Summarize(runs, fp)
	fmt.Printf("forecast \"rounds to the next letter\": shown in %.0f%% of rounds; %d forecasts, error mean %.1f, median %.1f rounds\n"+
		"  (mean wait %.1f); within max(2, 25%%) %.0f%%, too hopeful %.0f%%; \"more than %d\": %d, right %d\n",
		s.Shown*100, s.N, s.MeanAbs, s.MedianAbs, s.MeanActual, s.Within*100, s.Early*100, fp.MaxRounds, s.More, s.MoreRight)
}

// row summarises the runs of one strategy. Runs that gave up count as
// MaxExercises, so the mean is a lower bound when not every run reached the goal.
func row(name string, res []sim.Result, vs []sim.Variety) string {
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
	first := make([]sim.Variety, len(res))
	letters, after, afterN := 0.0, 0.0, 0
	for i, r := range res {
		first[i] = r.Variety
		letters += r.Letters
		if !math.IsNaN(r.RankAfter) {
			after += r.RankAfter
			afterN++
		}
	}
	afterStr := "-"
	if afterN > 0 {
		afterStr = fmt.Sprintf("%.0f", after/float64(afterN))
	}
	return fmt.Sprintf("%-22s %6.0f %6.0f %4d/%-2d %5s %4.1f %5s | %s | %s",
		name, median, float64(sum)/float64(len(res)), reached, len(res), openStr,
		letters/float64(len(res)), afterStr, pct(first), pct(vs))
}

// pct prints the mean variety of several runs in percent, and the mean
// word length in letters.
func pct(vs []sim.Variety) string {
	var d, r, t, l, k float64
	for _, v := range vs {
		d += v.Distinct
		r += v.Repeated
		t += v.TopShare
		l += v.Letters
		k += v.Rank
	}
	n := float64(len(vs)) / 100
	m := float64(len(vs))
	return fmt.Sprintf("%4.0f%% %4.0f%% %4.0f%% %5.1f %5.0f", d/n, r/n, t/n, l/m, k/m)
}

// fail prints the error and stops with exit code 1.
func fail(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
