// Package api is the HTTP layer: it turns JSON requests into calls to the
// engine and the store, and turns the answers back into JSON.
// All routes start with /api/v1/. Every route except /languages takes
// ?lang=<id> (default: the first language in data/languages.json).
// Every handler also knows whose data it works with (userOf).
package api

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"typingtrainer/internal/config"
	"typingtrainer/internal/engine"
	"typingtrainer/internal/freeplay"
	"typingtrainer/internal/language"
	"typingtrainer/internal/storage"
)

// Language is everything the server needs for one typing language.
type Language struct {
	Info       language.Language
	Gen        *engine.Generator // learning: the adaptive word choice
	Free       *freeplay.Picker  // free practice: words drawn evenly
	LayoutJSON []byte
}

type Server struct {
	cfg   config.Config
	store storage.Store
	langs map[string]*Language
	order []*Language // the order of data/languages.json; order[0] is the default

	// genMu: the generators' random sources are not safe for parallel use.
	// writeMu: makes "read stats -> update -> save" one atomic step.
	// (A PostgreSQL store would do this inside a transaction instead.)
	genMu   sync.Mutex
	writeMu sync.Mutex
}

func NewServer(cfg config.Config, store storage.Store, langs []*Language) *Server {
	s := &Server{cfg: cfg, store: store, langs: map[string]*Language{}, order: langs}
	for _, l := range langs {
		s.langs[l.Info.ID] = l
	}
	return s
}

// Register adds all API routes to the mux (Go 1.22+ "METHOD /path" patterns).
func (s *Server) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/languages", s.handleLanguages)
	mux.HandleFunc("GET /api/v1/layout", s.withLang(s.handleLayout))
	mux.HandleFunc("POST /api/v1/portion", s.withLang(s.handlePortion))
	mux.HandleFunc("POST /api/v1/results", s.withLang(s.handleResults))
	mux.HandleFunc("POST /api/v1/progress", s.withLang(s.handleProgress))
	mux.HandleFunc("POST /api/v1/reset", s.withLang(s.handleReset))
	mux.HandleFunc("GET /api/v1/export", s.withLang(s.handleExport))
	mux.HandleFunc("POST /api/v1/import", s.withLang(s.handleImport))
	mux.HandleFunc("GET /api/v1/stats", s.withLang(s.handleStats))
	mux.HandleFunc("POST /api/v1/freeplay/portion", s.withLang(s.handleFreeplayPortion))
	mux.HandleFunc("POST /api/v1/freeplay/results", s.withLang(s.handleFreeplayResults))
	mux.HandleFunc("POST /api/v1/freeplay/test", s.withLang(s.handleFreeplayTest))
	mux.HandleFunc("GET /api/v1/freeplay/stats", s.withLang(s.handleFreeplayStats))
}

// langHandler gets, besides the request, WHOSE data it works with and in
// which language. Every handler passes both on to the store.
type langHandler func(w http.ResponseWriter, r *http.Request, user string, l *Language)

// withLang reads ?lang= and passes the matching Language to the handler,
// together with the user the request belongs to (userOf).
// An unknown language is a 400 error, an empty one means the default.
func (s *Server) withLang(h langHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("lang")
		l := s.order[0]
		if id != "" {
			var ok bool
			if l, ok = s.langs[id]; !ok {
				badRequest(w, "unknown language: "+id)
				return
			}
		}
		h(w, r, s.userOf(r), l)
	}
}

// userOf says whose data a request works with. There are no accounts yet,
// so every request belongs to storage.LocalUser. When login is added, this
// is the one place that reads the session and returns the logged-in user.
func (s *Server) userOf(r *http.Request) string {
	return storage.LocalUser
}

// GET /api/v1/languages -> the list for the language switch.
func (s *Server) handleLanguages(w http.ResponseWriter, r *http.Request) {
	out := make([]language.Language, len(s.order))
	for i, l := range s.order {
		out[i] = l.Info
	}
	writeJSON(w, http.StatusOK, out)
}

// GET /api/v1/layout?lang= -> the keyboard layout JSON, as is.
func (s *Server) handleLayout(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	w.Header().Set("Content-Type", "application/json")
	w.Write(l.LayoutJSON)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func badRequest(w http.ResponseWriter, msg string) {
	writeJSON(w, http.StatusBadRequest, map[string]string{"error": msg})
}

func serverError(w http.ResponseWriter, err error) {
	log.Println("error:", err)
	writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
}
