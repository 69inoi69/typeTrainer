// Setup shared by both ways of running the app:
//   - main.go:      a normal web server on your computer (go run .)
//   - main_wasm.go: the same app compiled to WebAssembly for GitHub Pages
//
// Both call newApp(), so the engine, the store and the API handlers are
// exactly the same code in both versions. The few differences (which store,
// accounts on or off, the proxy setting) live in build_server.go and
// build_wasm.go; Go build tags pick one of them.
//
// To add something every request needs at start (a new data file, a new
// package to wire in): load it in newApp or loadLanguage here, so both
// versions get it.
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
	cfg.Accounts = accountsOn // off in the WebAssembly build (build_wasm.go)
	cfg.BehindProxy = behindProxy()

	langData, err := files.ReadFile("data/languages.json")
	if err != nil {
		return nil, cfg, err
	}
	infos, err := language.Parse(langData)
	if err != nil {
		return nil, cfg, err
	}

	// a new random seed on every start; each language (and its free practice
	// picker, seed+1 in loadLanguage) gets its own random source
	seed := time.Now().UnixNano()
	var langs []*api.Language
	for i, info := range infos {
		l, err := loadLanguage(info, cfg, seed+int64(i))
		if err != nil {
			return nil, cfg, fmt.Errorf("language %s: %w", info.ID, err)
		}
		langs = append(langs, l)
	}

	// PostgreSQL or memory: build_server.go / build_wasm.go decide.
	store, err := openStore()
	if err != nil {
		return nil, cfg, err
	}

	server := api.NewServer(cfg, store, langs)
	mux := http.NewServeMux()
	server.Register(mux)
	webFS, err := fs.Sub(files, "web")
	if err != nil {
		return nil, cfg, err
	}
	// everything that is not /api/v1/ is a file of the page itself
	mux.Handle("/", http.FileServerFS(webFS))
	return server.WithGuest(mux), cfg, nil
}

// loadLanguage reads one language's layout and word lists and builds its
// generator (the unlock order is computed from the words, with the home row
// of the layout first).
func loadLanguage(info language.Language, cfg config.Config, seed int64) (*api.Language, error) {
	layoutJSON, err := files.ReadFile("data/layouts/" + info.Layout + ".json")
	if err != nil {
		return nil, err
	}
	lay, err := layout.Parse(layoutJSON) // fail early on a broken layout
	if err != nil {
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
	gen.SetHome(lay.RestingKeys(), cfg.Engine)
	gen.SetWordParams(cfg.Words)
	// The long list (tools/wordlists/free.py), for Climb and Freetype: Climb
	// climbs from its 200 most common words to all of them in 10 levels
	// (words.txt, 2000 words, would end easier than Freetype's 5k list). A
	// language without one uses words.txt for both.

	long := words
	if data, err := files.ReadFile("data/langs/" + info.ID + "/free.txt"); err == nil {
		long = info.Words(string(data))
	}
	free := freeplay.NewPicker(freeplay.Longer(long, cfg.Freeplay.MinLetters), rand.New(rand.NewSource(seed+1)))
	freetype := freeplay.NewPicker(long, rand.New(rand.NewSource(seed+2)))
	// Freetype's real sentences (tools/sentences/build.py); a language
	// without the file has no "sentences" switch.
	var sentences *freeplay.Sentences
	if data, err := files.ReadFile("data/langs/" + info.ID + "/sentences.txt"); err == nil {
		sentences = freeplay.NewSentences(freeplay.ParseSentences(string(data)), rand.New(rand.NewSource(seed+3)))
	}
	return &api.Language{Info: info, Gen: gen, Free: free, Freetype: freetype, Sentences: sentences, LayoutJSON: layoutJSON}, nil
}
