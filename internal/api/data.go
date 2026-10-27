// Data routes: reset, export and import.

package api

import (
	"encoding/json"
	"net/http"

	"typingtrainer/internal/engine"
	"typingtrainer/internal/freeplay"
	"typingtrainer/internal/storage"
)

func (s *Server) handleReset(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	if err := s.store.Reset(user, l.Info.ID); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

type langExport struct {
	Unlocked    int                       `json:"unlocked"`
	Keys        map[string]engine.KeyStat `json:"keys"`
	Sessions    []storage.Session         `json:"sessions"`
	Group       string                    `json:"group,omitempty"`
	Lap         int                       `json:"lap,omitempty"`
	Freeplay    *freeplayExport           `json:"freeplay,omitempty"`
	ClimbLevels int                       `json:"climbLevels,omitempty"`
	Freetype    map[string]freeplayExport `json:"freetype,omitempty"`
}

type freeplayExport struct {
	Sessions []storage.Session `json:"sessions"`
}

func summaries(sessions []storage.Session) []storage.Session {
	out := make([]storage.Session, len(sessions))
	for i, sess := range sessions {
		out[i] = sess.Summary()
	}
	return out
}

func oldestFirst(newestFirst []storage.Session) []storage.Session {
	out := make([]storage.Session, len(newestFirst))
	for i, sess := range newestFirst {
		out[len(newestFirst)-1-i] = sess
	}
	return out
}

func (s *Server) handleExport(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	id := l.Info.ID
	keys, err := s.store.KeyStats(user, id)
	if err != nil {
		serverError(w, err)
		return
	}
	unlocked, err := s.store.Unlocked(user, id)
	if err != nil {
		serverError(w, err)
		return
	}
	count, err := s.store.SessionCount(user, id, "")
	if err != nil {
		serverError(w, err)
		return
	}
	newestFirst, err := s.store.RecentSessions(user, id, "", count)
	if err != nil {
		serverError(w, err)
		return
	}
	group, err := s.store.Group(user, id)
	if err != nil {
		serverError(w, err)
		return
	}
	lap, err := s.store.Lap(user, id)
	if err != nil {
		serverError(w, err)
		return
	}
	free, err := s.allFreeplay(user, id, storage.ModeClimb)
	if err != nil {
		serverError(w, err)
		return
	}
	freetype := map[string]freeplayExport{}
	for _, key := range s.freetypeKeys(l) {
		n, v, _ := storage.ParseFreetypeKey(key)
		h, err := s.allFreeplay(user, id, storage.FreetypeMode(n, v))
		if err != nil {
			serverError(w, err)
			return
		}
		if len(h) > 0 {
			freetype[key] = freeplayExport{Sessions: h}
		}
	}
	writeJSON(w, http.StatusOK, langExport{
		Unlocked: unlocked, Keys: keys, Sessions: oldestFirst(newestFirst), Group: group, Lap: lap,
		Freeplay: &freeplayExport{Sessions: free}, ClimbLevels: len(s.cfg.Freeplay.Levels), Freetype: freetype,
	})
}

func (s *Server) allFreeplay(user, lang, mode string) ([]storage.Session, error) {
	count, err := s.store.FreeplaySessionCount(user, lang, mode, "")
	if err != nil {
		return nil, err
	}
	newestFirst, err := s.store.RecentFreeplaySessions(user, lang, mode, "", count)
	return oldestFirst(newestFirst), err
}

func (s *Server) handleImport(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	r.Body = http.MaxBytesReader(w, r.Body, int64(s.cfg.MaxImportBytes))
	var in langExport
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		badRequest(w, "invalid JSON")
		return
	}
	okFreetype := func(key string) bool {
		n, v, ok := storage.ParseFreetypeKey(key)
		return ok && s.validVariant(l, n, v)
	}
	if msg := validateImport(in, s.cfg.MaxImportSessions, s.cfg.MaxEvents, len(l.Gen.Order()), len(s.cfg.Freeplay.Levels), s.cfg.Engine.LastLap(s.cfg.Laps), l.Info.Alphabet, s.validLength, okFreetype, s.freetypeAlphabet(l.Info.Alphabet)); msg != "" {
		badRequest(w, msg)
		return
	}
	if in.Keys == nil {
		in.Keys = map[string]engine.KeyStat{}
	}
	id := l.Info.ID

	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	if err := s.store.Reset(user, id); err != nil {
		serverError(w, err)
		return
	}
	if err := s.store.SaveKeyStats(user, id, in.Keys); err != nil {
		serverError(w, err)
		return
	}
	if err := s.store.SetUnlocked(user, id, in.Unlocked); err != nil {
		serverError(w, err)
		return
	}
	if err := s.store.SetLap(user, id, in.Lap); err != nil {
		serverError(w, err)
		return
	}
	if err := s.store.SetGroup(user, id, in.Group); err != nil {
		serverError(w, err)
		return
	}
	for _, sess := range in.Sessions {
		if err := s.store.AddSession(user, id, sess); err != nil {
			serverError(w, err)
			return
		}
	}
	histories := map[string][]storage.Session{}
	if in.Freeplay != nil {
		if in.ClimbLevels == 0 {
			for i := range in.Freeplay.Sessions {
				in.Freeplay.Sessions[i].Level = float64(freeplay.LevelFromOld(in.Freeplay.Sessions[i].Level))
			}
		}
		histories[storage.ModeClimb] = in.Freeplay.Sessions
	}
	for list, f := range in.Freetype {
		n, v, _ := storage.ParseFreetypeKey(list)
		histories[storage.FreetypeMode(n, v)] = f.Sessions
	}
	for mode, sessions := range histories {
		for _, sess := range sessions {
			if err := s.store.AddFreeplaySession(user, id, mode, sess); err != nil {
				serverError(w, err)
				return
			}
		}
	}
	writeJSON(w, http.StatusOK, map[string]int{"unlocked": in.Unlocked, "sessions": len(in.Sessions)})
}

func (s *Server) handleGroup(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	var req struct {
		Group string `json:"group"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, int64(s.cfg.MaxSmallBodyBytes))).Decode(&req); err != nil {
		badRequest(w, "invalid JSON")
		return
	}
	if !validGroup(req.Group) {
		badRequest(w, "group: unknown")
		return
	}
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	if err := s.store.SetGroup(user, l.Info.ID, req.Group); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"group": req.Group})
}
