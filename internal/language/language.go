// Package language loads the typing languages from data/languages.json.
package language

import (
	"encoding/json"
	"fmt"
	"strings"
)

type Language struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Label        string `json:"label"`
	Layout       string `json:"layout"`
	Alphabet     string `json:"alphabet"`
	SystemLayout string `json:"systemLayout"`
	Hidden       bool   `json:"hidden,omitempty"`
}

func Parse(data []byte) ([]Language, error) {
	var langs []Language
	if err := json.Unmarshal(data, &langs); err != nil {
		return nil, fmt.Errorf("languages json: %w", err)
	}
	if len(langs) == 0 {
		return nil, fmt.Errorf("languages json: no languages")
	}
	if langs[0].Hidden {
		return nil, fmt.Errorf("language %q: the first language is the default and cannot be hidden", langs[0].ID)
	}
	seen := map[string]bool{}
	for _, l := range langs {
		switch {
		case l.ID == "" || l.Layout == "" || l.Alphabet == "":
			return nil, fmt.Errorf("language %q: id, layout and alphabet are required", l.ID)
		case seen[l.ID]:
			return nil, fmt.Errorf("language %q is listed twice", l.ID)
		}
		seen[l.ID] = true
	}
	return langs, nil
}

func (l Language) Allows(word string) bool {
	if word == "" {
		return false
	}
	for _, r := range word {
		if !strings.ContainsRune(l.Alphabet, r) {
			return false
		}
	}
	return true
}

func (l Language) Words(list string) []string {
	seen := map[string]bool{}
	var out []string
	for _, w := range strings.Fields(strings.ToLower(list)) {
		if !seen[w] && l.Allows(w) {
			seen[w] = true
			out = append(out, w)
		}
	}
	return out
}
