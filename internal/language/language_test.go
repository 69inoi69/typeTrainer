package language

import "testing"

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

func TestParse(t *testing.T) {
	ok := `[{"id":"en","layout":"qwerty-en","alphabet":"abc"}]`
	if _, err := Parse([]byte(ok)); err != nil {
		t.Fatalf("valid list: %v", err)
	}
	for name, bad := range map[string]string{
		"empty":       `[]`,
		"no alphabet": `[{"id":"en","layout":"qwerty-en"}]`,
		"duplicate":   `[{"id":"en","layout":"a","alphabet":"a"},{"id":"en","layout":"a","alphabet":"a"}]`,
		"not json":    `{`,
	} {
		if _, err := Parse([]byte(bad)); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
}
