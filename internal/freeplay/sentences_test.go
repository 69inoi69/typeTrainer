package freeplay

import (
	"math/rand"
	"strings"
	"testing"
)

// The file's header and empty lines are not sentences; spaces are tidied.
func TestParseSentences(t *testing.T) {
	got := ParseSentences("# from Tatoeba, CC BY 2.0 FR\n\nI like tea.\r\n  Where  is it?  \n")
	if len(got) != 2 || got[0] != "I like tea." || got[1] != "Where is it?" {
		t.Fatalf("ParseSentences = %q", got)
	}
	if NewSentences(nil, rand.New(rand.NewSource(1))) != nil {
		t.Error("no sentences: no picker")
	}
}

// A portion is whole sentences with at least n words, and a sentence of
// the round is not drawn again while others are left.
func TestSentences_Portion(t *testing.T) {
	list := []string{"I like tea.", "Where is it?", "Tom ran home, fast.", "Go!"}
	s := NewSentences(list, rand.New(rand.NewSource(2)))
	var round []string
	for i := 0; i < 3; i++ {
		por := s.Portion(round, 3, testParams)
		if len(por) < 3 {
			t.Fatalf("portion %q: fewer than 3 words", por)
		}
		round = append(round, por...)
	}
	text := strings.Join(round, " ")
	for _, sentence := range list {
		if strings.Count(text, sentence) > 1 {
			t.Errorf("%q twice in %q", sentence, text)
		}
	}
	// every word belongs to a whole sentence: the text is sentences joined
	rest := " " + text + " "
	for _, sentence := range list {
		rest = strings.ReplaceAll(rest, " "+sentence+" ", " ")
	}
	if strings.TrimSpace(rest) != "" {
		t.Errorf("not whole sentences: %q left", rest)
	}
	// a list of one sentence still gives a portion (it repeats)
	one := NewSentences([]string{"Go!"}, rand.New(rand.NewSource(3)))
	if got := one.Portion([]string{"Go!"}, 2, testParams); strings.Join(got, " ") != "Go! Go!" {
		t.Errorf("one sentence: %q", got)
	}
}
