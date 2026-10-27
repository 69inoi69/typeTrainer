// Setup shared by the server and the GitHub Pages build.
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

//go:embed web data
var files embed.FS

func newApp() (http.Handler, config.Config, error) { return newAppWith(openStore) }

func newAppWith(open func() (storage.Store, error)) (http.Handler, config.Config, error) {
	cfg := config.Default()
	cfg.Accounts = accountsOn
	cfg.BehindProxy = behindProxy()

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

	store, err := open()
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
	mux.Handle("/", http.FileServerFS(webFS))
	return server.WithGuest(mux), cfg, nil
}

func loadLanguage(info language.Language, cfg config.Config, seed int64) (*api.Language, error) {
	layoutJSON, err := files.ReadFile("data/layouts/" + info.Layout + ".json")
	if err != nil {
		return nil, err
	}
	lay, err := layout.Parse(layoutJSON)
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
	long := words
	if data, err := files.ReadFile("data/langs/" + info.ID + "/free.txt"); err == nil {
		long = info.Words(string(data))
	}
	free := freeplay.NewPicker(freeplay.Longer(long, cfg.Freeplay.MinLetters), rand.New(rand.NewSource(seed+1)))
	freetype := freeplay.NewPicker(long, rand.New(rand.NewSource(seed+2)))
	var sentences *freeplay.Sentences
	if data, err := files.ReadFile("data/langs/" + info.ID + "/sentences.txt"); err == nil {
		sentences = freeplay.NewSentences(freeplay.ParseSentences(string(data)), rand.New(rand.NewSource(seed+3)))
	}
	return &api.Language{Info: info, Gen: gen, Free: free, Freetype: freetype, Sentences: sentences, LayoutJSON: layoutJSON}, nil
}
