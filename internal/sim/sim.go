// Package sim simulates typists to compare word choice strategies.
package sim

import (
	"fmt"
	"math"
	"math/rand"
	"strings"
	"unicode/utf8"

	"typingtrainer/internal/engine"
)

type Params struct {
	ErrMin, ErrMax   float64
	TimeMin, TimeMax float64
	ErrFloor         float64
	TimeFloor        float64
	LearnRate        float64
	TimeNoise        float64

	ExpertErrMax                 float64
	ExpertTimeMin, ExpertTimeMax float64
	OpenExercises                int
	FirstExercises               int

	Runs         int
	MaxExercises int

	BestOf        int
	MissPenaltyMs float64
	ScoreWindow   int
}

type Typist struct {
	err  map[string]float64
	time map[string]float64
	rng  *rand.Rand
	p    Params
}

func NewTypist(letters []string, p Params, rng *rand.Rand) *Typist {
	t := &Typist{err: map[string]float64{}, time: map[string]float64{}, p: p}
	for _, c := range letters {
		t.err[c] = p.ErrMin + rng.Float64()*(p.ErrMax-p.ErrMin)
		t.time[c] = p.TimeMin + rng.Float64()*(p.TimeMax-p.TimeMin)
	}
	return t
}

func NewExpert(letters []string, p Params, rng *rand.Rand) *Typist {
	q := p
	q.ErrMin, q.ErrMax = p.ErrFloor, p.ExpertErrMax
	q.TimeMin, q.TimeMax = p.ExpertTimeMin, p.ExpertTimeMax
	t := NewTypist(letters, q, rng)
	t.p = p
	return t
}

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

func (t *Typist) Type(text string) []engine.Sample { return t.typeText(text, true) }

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
		if !first {
			smp.Ms = t.time[c] * (1 + t.p.TimeNoise*(2*t.rng.Float64()-1))
		}
		first = false
		out = append(out, smp)

		t.err[c] = t.p.ErrFloor + (t.err[c]-t.p.ErrFloor)*(1-t.p.LearnRate)
		t.time[c] = t.p.TimeFloor + (t.time[c]-t.p.TimeFloor)*(1-t.p.LearnRate)
	}
	return out
}

func (t *Typist) Skilled(ep engine.Params) bool {
	for c, e := range t.err {
		if e > ep.MasteryErrorRate || t.time[c] > ep.TargetMs() {
			return false
		}
	}
	return true
}

type Strategy interface {
	Name() string
	Text(stats map[string]engine.KeyStat, unlocked, typed int) string
	Observe(samples []engine.Sample)
}

type Adaptive struct {
	Gen *engine.Generator
	EP  engine.Params
}

func (a *Adaptive) Name() string { return "adaptive (softmax)" }
func (a *Adaptive) Text(stats map[string]engine.KeyStat, unlocked, typed int) string {
	return a.Gen.Next(stats, unlocked, typed, a.EP).Text
}
func (a *Adaptive) Observe([]engine.Sample) {}

type Stream struct {
	Gen    *engine.Generator
	EP     engine.Params
	queue  []string
	recent []string
	retry  []string
	typing string
	built  int
	typed  int
}

func (s *Stream) RoundStart() bool { return s.typed == 1 }

func (s *Stream) Name() string { return "stream (portions)" }

func (s *Stream) Text(stats map[string]engine.KeyStat, unlocked, typed int) string {
	if s.typed == s.EP.RoundPortions {
		s.queue, s.recent, s.retry, s.built, s.typed = nil, nil, nil, 0, 0
	}
	for len(s.queue) < s.EP.AheadPortions+1 && s.built < s.EP.RoundPortions {
		s.built++
		por := s.Gen.Portion(stats, unlocked, typed, s.recent, s.retry, s.EP)
		s.retry = nil
		s.recent = append(s.recent, por.Words...)
		if len(s.recent) > 2*s.EP.RecentWords {
			s.recent = s.recent[len(s.recent)-s.EP.RecentWords:]
		}
		s.queue = append(s.queue, strings.Join(por.Words, " "))
	}
	s.typing, s.queue = s.queue[0], s.queue[1:]
	s.typed++
	return s.typing
}

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

type Random struct {
	Gen   *engine.Generator
	Words int
	Rng   *rand.Rand
}

func (s *Random) Name() string { return "random words" }
func (s *Random) Text(_ map[string]engine.KeyStat, unlocked, _ int) string {
	return pick(s.Gen.Words(unlocked), s.Words, s.Rng, func(cands []string) string {
		return cands[s.Rng.Intn(len(cands))]
	})
}
func (s *Random) Observe([]engine.Sample) {}

type BestOfN struct {
	Gen    *engine.Generator
	Words  int
	Rng    *rand.Rand
	P      Params
	score  map[string]float64
	scored map[string]int
}

func (s *BestOfN) Name() string { return fmt.Sprintf("best of %d (monkeytype)", s.P.BestOf) }

func (s *BestOfN) Text(_ map[string]engine.KeyStat, unlocked, _ int) string {
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

type Result struct {
	Exercises int
	Reached   bool
	AllOpenAt int
	Variety   Variety
	Letters   float64
	RankAfter float64
}

func typeNext(s Strategy, t *Typist, text string) []engine.Sample {
	if st, stream := s.(*Stream); stream && !st.RoundStart() {
		return t.TypeMore(text)
	}
	return t.Type(text)
}

func Run(gen *engine.Generator, s Strategy, t *Typist, ep engine.Params, p Params) Result {
	stats := map[string]engine.KeyStat{}
	unlocked := gen.Start()
	res := Result{}
	v := variety{size: ep.ExerciseWords, rankOf: gen.Rank}
	exercises := func(words int) int { return (words + ep.ExerciseWords - 1) / ep.ExerciseWords }
	letters := 0
	typed := 0
	rankSum, rankN := 0.0, 0
	all := len(gen.Order())
	for words := 0; words < p.MaxExercises*ep.ExerciseWords; {
		text := s.Text(stats, unlocked, typed)
		if len(text) == 0 {
			break
		}
		if v.n < p.FirstExercises {
			v.add(text)
		}
		samples := typeNext(s, t, text)
		if unlocked == all {
			typed += len(samples)
			for _, w := range strings.Fields(text) {
				rankSum += float64(gen.Rank(w))
				rankN++
			}
		}
		words += len(strings.Fields(text))
		letters += len(samples)
		res.Letters = float64(letters) / float64(words)
		s.Observe(samples)
		stats = engine.Apply(stats, samples, ep)
		unlocked = gen.NextUnlocked(stats, unlocked, ep)
		if res.AllOpenAt == 0 && unlocked == len(gen.Order()) {
			res.AllOpenAt = exercises(words)
		}
		if res.AllOpenAt > 0 && t.Skilled(ep) {
			res.Exercises, res.Reached = exercises(words), true
			break
		}
	}
	if !res.Reached {
		res.Exercises = p.MaxExercises
	}
	res.Variety = v.result()
	res.RankAfter = math.NaN()
	if rankN > 0 {
		res.RankAfter = rankSum / float64(rankN)
	}
	if letters == 0 {
		res.Letters = math.NaN()
	}
	return res
}

type Variety struct {
	Distinct float64
	Repeated float64
	TopShare float64
	Letters  float64
	Rank     float64
}

func RunOpen(gen *engine.Generator, s Strategy, t *Typist, ep engine.Params, n int) Variety {
	stats := map[string]engine.KeyStat{}
	all := len(gen.Order())
	v := variety{size: ep.ExerciseWords, rankOf: gen.Rank}
	typed := 0
	for words := 0; words < n*ep.ExerciseWords; {
		text := s.Text(stats, all, typed)
		if len(text) == 0 {
			break
		}
		v.add(text)
		samples := typeNext(s, t, text)
		typed += len(samples)
		words += len(strings.Fields(text))
		s.Observe(samples)
		stats = engine.Apply(stats, samples, ep)
	}
	return v.result()
}

type variety struct {
	size                    int
	buf                     []string
	n                       int
	distinct, repeated, top float64
	letters, rank           float64
	rankOf                  func(string) int
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
	n := 0
	for _, w := range words {
		n += utf8.RuneCountInString(w)
	}
	v.letters += float64(n) / float64(len(words))
	if v.rankOf != nil {
		k := 0
		for _, w := range words {
			k += v.rankOf(w)
		}
		v.rank += float64(k) / float64(len(words))
	}
	inWords := map[rune]int{}
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

func (v *variety) result() Variety {
	if v.n == 0 {
		return Variety{math.NaN(), math.NaN(), math.NaN(), math.NaN(), math.NaN()}
	}
	out := Variety{
		Distinct: v.distinct / float64(v.n),
		Repeated: math.NaN(),
		TopShare: v.top / float64(v.n),
		Letters:  v.letters / float64(v.n),
		Rank:     math.NaN(),
	}
	if v.rankOf != nil {
		out.Rank = v.rank / float64(v.n)
	}
	if v.n > 1 {
		out.Repeated = v.repeated / float64(v.n-1)
	}
	return out
}
