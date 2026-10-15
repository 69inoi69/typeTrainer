// Package layout describes a keyboard layout as DATA (loaded from JSON),
// so new layouts / languages are just new JSON files, not new code.
//
// The browser draws the keyboard and the finger hints from the same JSON
// (web/languages.js fetches it from /api/v1/layout,
// web/keyboard.js draws it). On the Go side setup.go
// only calls Parse, so a broken layout file stops the app at start instead
// of showing a broken keyboard later. To add a layout: a new file in
// data/layouts/, named in data/languages.json (see "Adding a layout or
// language" in docs/ARCHITECTURE.md).
package layout

import (
	"encoding/json"
	"fmt"
)

// Key is one key of the keyboard picture.
type Key struct {
	Char   string  `json:"char"`            // what the key types, e.g. "f" or " "
	Label  string  `json:"label,omitempty"` // what is drawn on it, defaults to Char
	Finger string  `json:"finger"`          // id from Layout.Fingers, e.g. "li"
	Home   bool    `json:"home,omitempty"`  // home-row bump (F and J)
	Width  float64 `json:"width,omitempty"` // relative width, defaults to 1
	// Alt is the letter this key types together with AltGr (Polish ą on the
	// "a" key). Modifier marks a key that types nothing itself (AltGr).
	Alt      string `json:"alt,omitempty"`
	Modifier bool   `json:"modifier,omitempty"`
}

// Finger is one finger and the color of its zone. Name only makes the file
// readable: the interface takes finger names from web/i18n.js ("finger.li").
type Finger struct {
	Name  string `json:"name"`  // "Left index"
	Color string `json:"color"` // CSS color for the finger zone
}

// Layout is one whole keyboard: rows of keys and the fingers they belong to.
type Layout struct {
	ID      string            `json:"id"`
	Name    string            `json:"name"`
	Fingers map[string]Finger `json:"fingers"`
	Rows    [][]Key           `json:"rows"`
	Offsets []float64         `json:"offsets"` // left indent of each row, in key widths
}

// Parse reads a layout and checks that every key points to a known finger.
func Parse(data []byte) (*Layout, error) {
	var l Layout
	if err := json.Unmarshal(data, &l); err != nil {
		return nil, fmt.Errorf("layout json: %w", err)
	}
	for _, row := range l.Rows {
		for _, k := range row {
			if _, ok := l.Fingers[k.Finger]; !ok {
				return nil, fmt.Errorf("key %q uses unknown finger %q", k.Char, k.Finger)
			}
		}
	}
	return &l, nil
}

// FingerFor returns the finger id for a character ("" if not on the layout).
func (l *Layout) FingerFor(char string) string {
	for _, row := range l.Rows {
		for _, k := range row {
			if k.Char == char {
				return k.Finger
			}
		}
	}
	return ""
}
