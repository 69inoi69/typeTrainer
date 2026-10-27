// Package layout loads keyboard layouts from data/layouts.
package layout

import (
	"encoding/json"
	"fmt"
	"strings"
)

type Key struct {
	Char     string  `json:"char"`
	Label    string  `json:"label,omitempty"`
	Finger   string  `json:"finger"`
	Home     bool    `json:"home,omitempty"`
	Width    float64 `json:"width,omitempty"`
	Alt      string  `json:"alt,omitempty"`
	Modifier bool    `json:"modifier,omitempty"`
}

type Finger struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

type Layout struct {
	ID      string            `json:"id"`
	Name    string            `json:"name"`
	Fingers map[string]Finger `json:"fingers"`
	Rows    [][]Key           `json:"rows"`
	Offsets []float64         `json:"offsets"`
}

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

func (l *Layout) RestingKeys() []string {
	for _, row := range l.Rows {
		bump := false
		for _, k := range row {
			bump = bump || k.Home
		}
		if !bump {
			continue
		}
		var out []string
		taken := map[string]bool{}
		for _, k := range row {
			if k.Home && !taken[k.Finger] {
				taken[k.Finger] = true
				out = append(out, k.Char)
			}
		}
		for i := len(row) - 1; i >= 0; i-- {
			if k := row[i]; strings.HasPrefix(k.Finger, "l") && !taken[k.Finger] && !k.Modifier {
				taken[k.Finger] = true
				out = append(out, k.Char)
			}
		}
		for _, k := range row {
			if strings.HasPrefix(k.Finger, "r") && !taken[k.Finger] && !k.Modifier {
				taken[k.Finger] = true
				out = append(out, k.Char)
			}
		}
		return out
	}
	return nil
}

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
