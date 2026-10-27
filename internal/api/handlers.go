// Package api is the HTTP layer between JSON requests, the engine and the
// store.
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

type Language struct {
	Info       language.Language
	Gen        *engine.Generator
	Free       *freeplay.Picker
	Freetype   *freeplay.Picker
	Sentences  *freeplay.Sentences
	LayoutJSON []byte
}

type Server struct {
	cfg   config.Config
	store storage.Store
	langs map[string]*Language
	order []*Language

	genMu   sync.Mutex
	writeMu sync.Mutex

	attempts *auth.Limiter
}

func NewServer(cfg config.Config, store storage.Store, langs []*Language) *Server {
	s := &Server{cfg: cfg, store: store, langs: map[string]*Language{}, order: langs,
		attempts: auth.NewLimiter(cfg.Auth.Attempts, time.Duration(cfg.Auth.AttemptWindow)*time.Minute)}
	for _, l := range langs {
		s.langs[l.Info.ID] = l
	}
	return s
}

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

type langHandler func(w http.ResponseWriter, r *http.Request, user string, l *Language)

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

func (s *Server) handleLanguages(w http.ResponseWriter, r *http.Request) {
	out := []language.Language{}
	for _, l := range s.order {
		if !l.Info.Hidden {
			out = append(out, l.Info)
		}
	}
	writeJSON(w, http.StatusOK, out)
}

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
