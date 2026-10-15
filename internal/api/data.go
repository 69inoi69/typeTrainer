// Data routes: reset, export and import of everything stored for a language
// (learning and free practice together).

package api

import (
	"encoding/json"
	"net/http"

	"typingtrainer/internal/engine"
	"typingtrainer/internal/storage"
)

// POST /api/v1/reset?lang= -> deletes all statistics, unlocked letters and
// history of the language (learning and free practice), for whoever asks:
// the logged-in account or this browser's guest. Used by the reset button
// of the settings panel (web/tools.js), which calls it once for every language.
func (s *Server) handleReset(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	if err := s.store.Reset(user, l.Info.ID); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// langExport is everything stored for one language, in a form that can be
// saved to a file and loaded back (the same shape is used in both directions).
type langExport struct {
	Unlocked int                       `json:"unlocked"`        // how many letters are open
	Keys     map[string]engine.KeyStat `json:"keys"`            // the raw statistics per letter
	Sessions []storage.Session         `json:"sessions"`        // finished exercises, OLDEST first
	Group    string                    `json:"group,omitempty"` // study group ("" = the normal app)
	// free practice: absent in files from before it existed
	Freeplay *freeplayExport `json:"freeplay,omitempty"`
}

// freeplayExport is the free practice part of langExport.
type freeplayExport struct {
	TestPassed bool              `json:"testPassed"`
	Sessions   []storage.Session `json:"sessions"` // OLDEST first
}

// summaries drops the raw keys of every session: the stats pages show many
// sessions and need only their numbers. The full record is in /export.
func summaries(sessions []storage.Session) []storage.Session {
	out := make([]storage.Session, len(sessions))
	for i, sess := range sessions {
		out[i] = sess.Summary()
	}
	return out
}

// oldestFirst turns a newest-first list around: the file reads like a diary.
func oldestFirst(newestFirst []storage.Session) []storage.Session {
	out := make([]storage.Session, len(newestFirst))
	for i, sess := range newestFirst {
		out[len(newestFirst)-1-i] = sess
	}
	return out
}

// GET /api/v1/export?lang= -> all stored data of the language (nothing is cut:
// the full history, not the last 50). The browser joins the languages in a file.
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
	passed, err := s.store.TestPassed(user, id)
	if err != nil {
		serverError(w, err)
		return
	}
	group, err := s.store.Group(user, id)
	if err != nil {
		serverError(w, err)
		return
	}
	freeCount, err := s.store.FreeplaySessionCount(user, id, "")
	if err != nil {
		serverError(w, err)
		return
	}
	free, err := s.store.RecentFreeplaySessions(user, id, "", freeCount)
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, langExport{
		Unlocked: unlocked, Keys: keys, Sessions: oldestFirst(newestFirst), Group: group,
		Freeplay: &freeplayExport{TestPassed: passed, Sessions: oldestFirst(free)},
	})
}

// POST /api/v1/import?lang= <the JSON from /export> -> REPLACES everything stored
// for the language. The data is checked first; if anything is wrong nothing changes.
// The import is Reset followed by the same writes a normal round makes, all
// under writeMu, so no other write (a round, a second import) mixes in.
// A store error in the middle (a broken database) can still leave it half
// written: the store has no "import everything" method that would make it
// one step.
func (s *Server) handleImport(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	r.Body = http.MaxBytesReader(w, r.Body, int64(s.cfg.MaxImportBytes))
	var in langExport
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		badRequest(w, "invalid JSON")
		return
	}
	if msg := validateImport(in, s.cfg.MaxImportSessions, s.cfg.MaxEvents, len(l.Gen.Order()), l.Info.Alphabet, s.validLength); msg != "" {
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
	if f := in.Freeplay; f != nil {
		if err := s.store.SetTestPassed(user, id, f.TestPassed); err != nil {
			serverError(w, err)
			return
		}
		for _, sess := range f.Sessions {
			if err := s.store.AddFreeplaySession(user, id, sess); err != nil {
				serverError(w, err)
				return
			}
		}
	}
	writeJSON(w, http.StatusOK, map[string]int{"unlocked": in.Unlocked, "sessions": len(in.Sessions)})
}

// POST /api/v1/group?lang= {"group": "random"} -> puts the user into a group
// of a user study for this language ("" = back to the normal app). Not in
// the interface: the study link sets it (web/app.js, ?group=). See
// docs/ALGORITHM.md section 11.
func (s *Server) handleGroup(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	var req struct {
		Group string `json:"group"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&req); err != nil {
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
