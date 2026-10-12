// Setup shared by both ways of running the app:
//   - main.go:      a normal web server on your computer (go run .)
//   - main_wasm.go: the same app compiled to WebAssembly for GitHub Pages
//
// Both call newApp(), so the engine, the store and the API handlers are
// exactly the same code in both versions.
package main

import (
	"embed"
	"fmt"
	"io/fs"
	"math/rand"
	"net/http"
	"strings"
	"time"

	"typingtrainer/internal/api"
	"typingtrainer/internal/config"
	"typingtrainer/internal/engine"
	"typingtrainer/internal/layout"
	"typingtrainer/internal/storage"
)

// The web/ and data/ folders are baked into the program at build time,
// so it works no matter which folder you start it from.
//
//go:embed web data
var files embed.FS

// newApp loads the data files and wires the packages together.
// It returns the HTTP handler (API + web files) and the config.
func newApp() (http.Handler, config.Config, error) {
	cfg := config.Default()

	layoutJSON, err := files.ReadFile("data/layouts/qwerty-en.json")
	if err != nil {
		return nil, cfg, err
	}
	if _, err := layout.Parse(layoutJSON); err != nil { // fail early on a broken layout
		return nil, cfg, err
	}

	wordData, err := files.ReadFile("data/words-en.txt")
	if err != nil {
		return nil, cfg, err
	}
	words := uniqueWords(string(wordData))
	if len(words) == 0 {
		return nil, cfg, fmt.Errorf("word list is empty")
	}

	// Swap this line for storage.NewPostgresStore(...) later.
	var store storage.Store = storage.NewMemoryStore()

	gen := engine.NewGenerator(words, rand.New(rand.NewSource(time.Now().UnixNano())), cfg.Engine)
	server := api.NewServer(cfg, store, gen, layoutJSON)

	mux := http.NewServeMux()
	server.Register(mux)
	webFS, err := fs.Sub(files, "web")
	if err != nil {
		return nil, cfg, err
	}
	mux.Handle("/", http.FileServerFS(webFS))
	return mux, cfg, nil
}

// uniqueWords splits the word list (most frequent first), lowercases it,
// keeps only words made of the letters a-z and removes duplicates.
// The order is kept: it is the frequency order of the source list.
func uniqueWords(s string) []string {
	seen := map[string]bool{}
	var out []string
	for _, w := range strings.Fields(strings.ToLower(s)) {
		if !seen[w] && onlyLetters(w) {
			seen[w] = true
			out = append(out, w)
		}
	}
	return out
}

func onlyLetters(w string) bool {
	for _, r := range w {
		if r < 'a' || r > 'z' {
			return false
		}
	}
	return true
}
