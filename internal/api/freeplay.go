// Free practice routes (internal/freeplay): words drawn evenly from the
// whole list, its own history, and nothing sent here changes the letter
// statistics of learning. It opens when every letter is unlocked in
// learning, or after the typing test is passed once. The test's own route
// lives here too.

package api

import (
	"encoding/json"
	"net/http"
	"time"

	"typingtrainer/internal/engine"
	"typingtrainer/internal/freeplay"
	"typingtrainer/internal/storage"
)

// freeplayOpen says whether this user may use free practice in this
// language: the test was passed, or every letter is open in learning.
func (s *Server) freeplayOpen(user string, l *Language) (bool, error) {
	passed, err := s.store.TestPassed(user, l.Info.ID)
	if err != nil || passed {
		return passed, err
	}
	unlocked, err := s.store.Unlocked(user, l.Info.ID)
	if err != nil {
		return false, err
	}
	return l.Gen.Clamp(unlocked) == len(l.Gen.Order()), nil
}

// freeplayPortionRequest is the body of /freeplay/portion. Unlike learning,
// it carries no samples: free practice learns nothing.
type freeplayPortionRequest struct {
	Recent []string `json:"recent"` // words already in the round, oldest first
	Start  bool     `json:"start"`  // a new round: AheadPortions + 1 portions, else 1
}

// POST /api/v1/freeplay/portion?lang= -> {"portions": [{"words": [...]}], "round": 5}.
// Also gives the words of the typing test, so it works while free practice
// is still locked. Nothing is learned here: there are no samples.
func (s *Server) handleFreeplayPortion(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	var req freeplayPortionRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		badRequest(w, "invalid JSON")
		return
	}
	if len(req.Recent) > s.cfg.MaxEvents {
		badRequest(w, "recent: too long")
		return
	}
	p := s.cfg.Freeplay
	count := 1
	if req.Start {
		count = min(p.AheadPortions+1, p.RoundPortions)
	}
	type portion struct {
		Words []string `json:"words"`
	}
	out := make([]portion, count)
	recent := append([]string{}, req.Recent...)
	s.genMu.Lock()
	for i := range out {
		out[i].Words = l.Free.Portion(recent, p.PortionWords, p)
		recent = append(recent, out[i].Words...)
	}
	s.genMu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"portions": out, "round": p.RoundPortions})
}

// POST /api/v1/freeplay/results?lang= {wpm, accuracy, chars, perSecond, keys} ->
// one entry in the free practice history. {"consistency": 81.4 | null}.
// 403 while free practice is locked.
func (s *Server) handleFreeplayResults(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	var req resultsRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		badRequest(w, "invalid JSON")
		return
	}
	req.Samples = nil // free practice never touches the letter statistics
	if msg := validate(req, s.cfg.MaxEvents, l.Info.Alphabet); msg != "" {
		badRequest(w, msg)
		return
	}
	if !s.validLength(req.Length) {
		badRequest(w, "length: unknown round length")
		return
	}
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	open, err := s.freeplayOpen(user, l)
	if err != nil {
		serverError(w, err)
		return
	}
	if !open {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "free practice is locked"})
		return
	}
	var consistency *float64
	if v, ok := engine.Consistency(req.PerSecond, s.cfg.ConsistencyMinSeconds); ok {
		consistency = &v
	}
	err = s.store.AddFreeplaySession(user, l.Info.ID, storage.Session{
		WPM: req.WPM, Accuracy: req.Accuracy, Chars: req.Chars, Consistency: consistency, FinishedAt: time.Now(),
		Keys:   req.Keys, // kept as the raw record only, never learned from
		Length: req.Length,
	})
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"consistency": consistency})
}

// POST /api/v1/freeplay/test?lang= {wpm, accuracy, chars} -> the typing test:
// {"passed": true, "unlocked": true}. Passing (freeplay.Passed) opens free
// practice for good; a failed test changes nothing and can be retried. The
// test is not stored in any history. The numbers come from the browser, as
// every result does; the rule itself lives here, in one place.
func (s *Server) handleFreeplayTest(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	var req resultsRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		badRequest(w, "invalid JSON")
		return
	}
	req.Samples, req.PerSecond = nil, nil
	if msg := validate(req, s.cfg.MaxEvents, l.Info.Alphabet); msg != "" {
		badRequest(w, msg)
		return
	}
	passed := freeplay.Passed(req.WPM, req.Accuracy, s.cfg.Freeplay)
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	if passed {
		if err := s.store.SetTestPassed(user, l.Info.ID, true); err != nil {
			serverError(w, err)
			return
		}
	}
	open, err := s.freeplayOpen(user, l)
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"passed": passed, "unlocked": open})
}

// GET /api/v1/freeplay/stats?lang=&length= -> {"unlocked", "testPassed",
// "sessions" (the last 50 of that length, newest first), "sessionCount" (of
// that length), "lengths" (every length in the history), "testWpm",
// "testAccuracy"}. No length = rounds of every length.
func (s *Server) handleFreeplayStats(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	id := l.Info.ID
	length, ok := s.lengthParam(w, r)
	if !ok {
		return
	}
	open, err := s.freeplayOpen(user, l)
	if err != nil {
		serverError(w, err)
		return
	}
	passed, err := s.store.TestPassed(user, id)
	if err != nil {
		serverError(w, err)
		return
	}
	sessions, err := s.store.RecentFreeplaySessions(user, id, length, 50)
	if err != nil {
		serverError(w, err)
		return
	}
	count, err := s.store.FreeplaySessionCount(user, id, length)
	if err != nil {
		serverError(w, err)
		return
	}
	lengths, err := s.store.FreeplaySessionLengths(user, id)
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"unlocked": open, "testPassed": passed, "sessions": summaries(sessions), "sessionCount": count, "lengths": lengths,
		"testWpm": s.cfg.Freeplay.TestWPM, "testAccuracy": s.cfg.Freeplay.TestAccuracy,
	})
}
