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
	"time"

	"typingtrainer/internal/api"
	"typingtrainer/internal/config"
	"typingtrainer/internal/engine"
	"typingtrainer/internal/freeplay"
	"typingtrainer/internal/language"
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
	cfg.Accounts = accountsOn // off in the WebAssembly build (accounts_wasm.go)

	langData, err := files.ReadFile("data/languages.json")
	if err != nil {
		return nil, cfg, err
	}
	infos, err := language.Parse(langData)
	if err != nil {
		return nil, cfg, err
	}

	seed := time.Now().UnixNano()
	var langs []*api.Language
	for i, info := range infos {
		l, err := loadLanguage(info, cfg, seed+int64(i))
		if err != nil {
			return nil, cfg, fmt.Errorf("language %s: %w", info.ID, err)
		}
		langs = append(langs, l)
	}

	// Swap this line for storage.NewPostgresStore(...) later.
	var store storage.Store = storage.NewMemoryStore()

	server := api.NewServer(cfg, store, langs)
	mux := http.NewServeMux()
	server.Register(mux)
	webFS, err := fs.Sub(files, "web")
	if err != nil {
		return nil, cfg, err
	}
	mux.Handle("/", http.FileServerFS(webFS))
	return mux, cfg, nil
}

// loadLanguage reads one language's layout and word list and builds its
// generator (the unlock order is computed from the words).
func loadLanguage(info language.Language, cfg config.Config, seed int64) (*api.Language, error) {
	layoutJSON, err := files.ReadFile("data/layouts/" + info.Layout + ".json")
	if err != nil {
		return nil, err
	}
	if _, err := layout.Parse(layoutJSON); err != nil { // fail early on a broken layout
		return nil, err
	}
	wordData, err := files.ReadFile("data/langs/" + info.ID + "/words.txt")
	if err != nil {
		return nil, err
	}
	words := info.Words(string(wordData))
	if len(words) == 0 {
		return nil, fmt.Errorf("word list is empty")
	}
	gen := engine.NewGenerator(words, rand.New(rand.NewSource(seed)), cfg.Engine)
	free := freeplay.NewPicker(words, rand.New(rand.NewSource(seed+1)))
	return &api.Language{Info: info, Gen: gen, Free: free, LayoutJSON: layoutJSON}, nil
}
