// Freetype's real sentences.

package freeplay

import (
	"math/rand"
	"strings"
)

type Sentences struct {
	list []string
	rng  *rand.Rand
}

func ParseSentences(data string) []string {
	var out []string
	for _, line := range strings.Split(data, "\n") {
		line = strings.Join(strings.Fields(line), " ")
		if line != "" && !strings.HasPrefix(line, "#") {
			out = append(out, line)
		}
	}
	return out
}

func NewSentences(list []string, rng *rand.Rand) *Sentences {
	if len(list) == 0 {
		return nil
	}
	return &Sentences{list: list, rng: rng}
}

func (s *Sentences) Size() int { return len(s.list) }

func (s *Sentences) Portion(recent []string, n int, p Params) []string {
	seen := " " + strings.Join(recent, " ") + " "
	var out []string
	for len(out) < max(n, 1) {
		sentence := s.list[s.rng.Intn(len(s.list))]
		for try := 1; try < p.SentenceTries && strings.Contains(seen, " "+sentence+" "); try++ {
			sentence = s.list[s.rng.Intn(len(s.list))]
		}
		seen += sentence + " "
		out = append(out, strings.Fields(sentence)...)
	}
	return out
}
