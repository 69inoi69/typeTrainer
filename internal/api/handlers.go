// Package api is the HTTP layer: it turns JSON requests into calls to the
// engine and the store, and turns the answers back into JSON.
// All routes start with /api/v1/. Every route except /languages and /auth/* takes
// ?lang=<id> (default: the first language in data/languages.json).
// Every handler also knows whose data it works with (userOf).
//
// How it connects: setup.go builds one Server (NewServer) with the loaded
// languages and a storage.Store, calls Register to add the routes, and wraps
// the whole site in WithGuest. The handlers do no maths themselves: learning
// goes to internal/engine, Climb and Freetype (the second and third modes)
// to internal/freeplay, passwords and
// tokens to internal/auth, and all data to the store.
//
// The files: handlers.go (routes, shared helpers), learning.go, freeplay.go
// (Climb), freetype.go, data.go (reset, export, import), auth.go (accounts, guests) and
// validate.go (checks on what the browser sends). Every route is listed in
// the API table of docs/ARCHITECTURE.md.
package api

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"typingtrainer/internal/auth"
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
	Free       *freeplay.Picker  // Climb: words at the typist's level
	Freetype   *freeplay.Picker  // Freetype: the long list (free.txt), drawn evenly
	LayoutJSON []byte            // data/layouts/<layout>.json, sent to the browser as is
}

// Server holds everything the handlers share: the settings, the store and
// the languages. One Server serves all users and all languages.
type Server struct {
	cfg   config.Config
	store storage.Store
	langs map[string]*Language
	order []*Language // the order of data/languages.json; order[0] is the default

	// genMu: the generators' random sources are not safe for parallel use.
	// writeMu: makes "read stats -> update -> save" one atomic step.
	// Enough for one server process, with either store; several processes
	// on one database would need a transaction around it instead.
	genMu   sync.Mutex
	writeMu sync.Mutex

	attempts *auth.Limiter // login and sign-up attempts per IP address
}

// NewServer makes the Server. langs must not be empty: the first one is
// the default language of a request without ?lang=.
func NewServer(cfg config.Config, store storage.Store, langs []*Language) *Server {
	s := &Server{cfg: cfg, store: store, langs: map[string]*Language{}, order: langs,
		attempts: auth.NewLimiter(cfg.Auth.Attempts, time.Duration(cfg.Auth.AttemptWindow)*time.Minute)}
	for _, l := range langs {
		s.langs[l.Info.ID] = l
	}
	return s
}

// Register adds all API routes to the mux (Go 1.22+ "METHOD /path" patterns).
// A route that works with a user's data in one language is wrapped in
// withLang; only the language list and the account routes are not.
//
// To add a route: a handler method in the file of its part (learning.go,
// freeplay.go, freetype.go, data.go, auth.go), one line here, a test in setup_test.go
// and a row in the API table of docs/ARCHITECTURE.md.
func (s *Server) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/languages", s.handleLanguages)
	mux.HandleFunc("POST /api/v1/auth/register", s.handleRegister)
	mux.HandleFunc("POST /api/v1/auth/login", s.handleLogin)
	mux.HandleFunc("POST /api/v1/auth/logout", s.handleLogout)
	mux.HandleFunc("GET /api/v1/auth/me", s.handleMe)
	mux.HandleFunc("GET /api/v1/layout", s.withLang(s.handleLayout))
	mux.HandleFunc("POST /api/v1/portion", s.withLang(s.handlePortion))
	mux.HandleFunc("POST /api/v1/results", s.withLang(s.handleResults))
	mux.HandleFunc("POST /api/v1/progress", s.withLang(s.handleProgress))
	mux.HandleFunc("POST /api/v1/group", s.withLang(s.handleGroup))
	mux.HandleFunc("POST /api/v1/reset", s.withLang(s.handleReset))
	mux.HandleFunc("GET /api/v1/export", s.withLang(s.handleExport))
	mux.HandleFunc("POST /api/v1/import", s.withLang(s.handleImport))
	mux.HandleFunc("GET /api/v1/stats", s.withLang(s.handleStats))
	mux.HandleFunc("GET /api/v1/activity", s.withLang(s.handleActivity))
	mux.HandleFunc("GET /api/v1/learn/history", s.withLang(s.handleLearnHistory))
	mux.HandleFunc("POST /api/v1/freeplay/portion", s.withLang(s.handleFreeplayPortion))
	mux.HandleFunc("POST /api/v1/freeplay/results", s.withLang(s.handleFreeplayResults))
	mux.HandleFunc("GET /api/v1/freeplay/stats", s.withLang(s.handleFreeplayStats))
	mux.HandleFunc("POST /api/v1/freetype/portion", s.withLang(s.handleFreetypePortion))
	mux.HandleFunc("POST /api/v1/freetype/results", s.withLang(s.handleFreetypeResults))
	mux.HandleFunc("GET /api/v1/freetype/stats", s.withLang(s.handleFreetypeStats))
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
		user, err := s.userOf(r)
		if err != nil {
			serverError(w, err)
			return
		}
		h(w, r, user, l)
	}
}

// GET /api/v1/languages -> the list for the language switch. Hidden
// languages are left out (they still answer ?lang=, see language.Hidden).
func (s *Server) handleLanguages(w http.ResponseWriter, r *http.Request) {
	out := []language.Language{}
	for _, l := range s.order {
		if !l.Info.Hidden {
			out = append(out, l.Info)
		}
	}
	writeJSON(w, http.StatusOK, out)
}

// GET /api/v1/layout?lang= -> the keyboard layout JSON, as is.
func (s *Server) handleLayout(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	w.Header().Set("Content-Type", "application/json")
	w.Write(l.LayoutJSON)
}

// writeJSON sends v as JSON with the given HTTP status.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func badRequest(w http.ResponseWriter, msg string) {
	writeJSON(w, http.StatusBadRequest, map[string]string{"error": msg})
}

// serverError logs the real error on the server and tells the browser only
// "internal error": details such as database messages stay private.
func serverError(w http.ResponseWriter, err error) {
	log.Println("error:", err)
	writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
}
