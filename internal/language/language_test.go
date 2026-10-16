package language

import "testing"

// A word is allowed only if every letter is in the alphabet; the empty word never is.
func TestAllows(t *testing.T) {
	pl := Language{Alphabet: "aąbcćdeęfghijklłmnńoóprsśtuwyzźż"}
	uk := Language{Alphabet: "абвгґдеєжзиіїйклмнопрстуфхцчшщьюя"}
	cases := []struct {
		l    Language
		word string
		want bool
	}{
		{pl, "się", true},
		{pl, "żółw", true},
		{pl, "quiz", false}, // q is not in this alphabet
		{uk, "їжак", true},
		{uk, "это", false}, // э is Russian, not Ukrainian
		{uk, "", false},
	}
	for _, c := range cases {
		if got := c.l.Allows(c.word); got != c.want {
			t.Errorf("Allows(%q) = %v, want %v", c.word, got, c.want)
		}
	}
}

// A valid list parses; an empty list, a missing field, a repeated id or broken JSON is an error.
func TestParse(t *testing.T) {
	ok := `[{"id":"en","layout":"qwerty-en","alphabet":"abc"}]`
	if _, err := Parse([]byte(ok)); err != nil {
		t.Fatalf("valid list: %v", err)
	}
	for name, bad := range map[string]string{
		"empty":        `[]`,
		"no alphabet":  `[{"id":"en","layout":"qwerty-en"}]`,
		"duplicate":    `[{"id":"en","layout":"a","alphabet":"a"},{"id":"en","layout":"a","alphabet":"a"}]`,
		"not json":     `{`,
		"first hidden": `[{"id":"en","layout":"a","alphabet":"a","hidden":true}]`,
	} {
		if _, err := Parse([]byte(bad)); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
}

// Words lowercases, drops duplicates and foreign words, and keeps the frequency order.
func TestWords(t *testing.T) {
	en := Language{Alphabet: "abcdefghijklmnopqrstuvwxyz"}
	got := en.Words("The\nthe\ncafé\nand\n\nan't\na\n")
	want := []string{"the", "and", "a"} // lowercased, deduplicated, foreign letters dropped, order kept
	if len(got) != len(want) {
		t.Fatalf("Words = %q, want %q", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("Words = %q, want %q", got, want)
		}
	}
	if len(en.Words("")) != 0 {
		t.Fatal("empty list must give no words")
	}
}
