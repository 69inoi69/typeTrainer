// Package language describes the supported typing languages as DATA
// (data/languages.json). setup.go reads that file with Parse and cleans each
// word list with Words; the api package sends the list to the browser
// (/api/v1/languages).
//
// To add a language: one entry in data/languages.json, one layout file in
// data/layouts/ and one word list in data/langs/<id>/words.txt (made by
// tools/wordlists/build.py); no code changes. The interface texts in
// web/i18n.js are a separate matter. See "Adding a layout or language" in
// docs/ARCHITECTURE.md.
package language

import (
	"encoding/json"
	"fmt"
	"strings"
)

// Language is one entry of data/languages.json.
type Language struct {
	ID           string `json:"id"`           // "en", "pl", "uk", "ru"; also the folder in data/langs/
	Name         string `json:"name"`         // shown to the user, in the language itself
	Label        string `json:"label"`        // short label for the switch: "EN"
	Layout       string `json:"layout"`       // layout file in data/layouts/, without .json
	Alphabet     string `json:"alphabet"`     // every letter a word may contain
	SystemLayout string `json:"systemLayout"` // name of the OS keyboard layout to switch to
}

// Parse reads the language list and checks it for obvious mistakes.
func Parse(data []byte) ([]Language, error) {
	var langs []Language
	if err := json.Unmarshal(data, &langs); err != nil {
		return nil, fmt.Errorf("languages json: %w", err)
	}
	if len(langs) == 0 {
		return nil, fmt.Errorf("languages json: no languages")
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

// Allows reports whether every letter of word is in the alphabet.
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

// Words splits a word list (one word per line, most frequent first),
// lowercases it, keeps only words made of the language's letters and removes
// duplicates. The order is kept: it is the frequency order of the source list.
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
