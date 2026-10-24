// Freetype's real sentences (the kind of text "sentences": punctuation and
// capitals belong in real sentences, not on random words). The sentences
// come from Tatoeba (tools/sentences/build.py
// writes data/langs/<id>/sentences.txt, one per line), are drawn evenly,
// and are cut into portions like any other text: the round still ends
// after the words or the time the typist chose.

package freeplay

import (
	"math/rand"
	"strings"
)

// Sentences keeps the sentences of one language. Not safe for parallel use
// (its random source is not), so the api package calls it under
// Server.genMu, like Picker.
type Sentences struct {
	list []string
	rng  *rand.Rand
}

// ParseSentences reads sentences.txt: one sentence per line; empty lines
// and lines starting with # (the file's header) are skipped.
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

// NewSentences keeps the sentences of one language (nil if there are none).
func NewSentences(list []string, rng *rand.Rand) *Sentences {
	if len(list) == 0 {
		return nil
	}
	return &Sentences{list: list, rng: rng}
}

// Size is how many sentences there are.
func (s *Sentences) Size() int { return len(s.list) }

// Portion returns whole sentences with at least n words between them, as
// words: one portion of the text. recent are the words of the round so
// far: a sentence already among them is drawn again, up to SentenceTries
// times, so a round seldom has the same sentence twice (with thousands of
// sentences it almost never comes up; the tries only matter on a short list).
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
