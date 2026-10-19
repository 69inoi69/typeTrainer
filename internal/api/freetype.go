// Freetype routes, the third mode (freeplay.Picker.Freetype): words drawn
// evenly from a list the typist chose (the n most common words), as on
// monkeytype. Nothing adapts and nothing is learned: every list has its
// own history (storage.FreetypeMode), apart from Climb and from learning.

package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"typingtrainer/internal/engine"
	"typingtrainer/internal/storage"
)

// freetypeLists are the lists Freetype offers in language l: the ones of
// the config its long list has enough words for.
func (s *Server) freetypeLists(l *Language) []int {
	out := []int{}
	for _, n := range s.cfg.Freeplay.FreetypeLists {
		if n <= l.Freetype.Size() {
			out = append(out, n)
		}
	}
	return out
}

// validList: is n one of the lists Freetype offers in l?
func (s *Server) validList(l *Language, n int) bool {
	for _, m := range s.freetypeLists(l) {
		if m == n {
			return true
		}
	}
	return false
}

// POST /api/v1/freetype/portion?lang= {recent, start, list} ->
// {"portions": [{"words": [...]}], "round": 5}: like /freeplay/portion,
// from the list of the list most common words, without a level.
func (s *Server) handleFreetypePortion(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	var req struct {
		Recent []string `json:"recent"` // words already in the round, oldest first
		Start  bool     `json:"start"`  // a new round: AheadPortions + 1 portions, else 1
		List   int      `json:"list"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		badRequest(w, "invalid JSON")
		return
	}
	if len(req.Recent) > s.cfg.MaxEvents {
		badRequest(w, "recent: too long")
		return
	}
	if !s.validList(l, req.List) {
		badRequest(w, "list: not offered")
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
		out[i].Words = l.Freetype.Freetype(recent, p.PortionWords, req.List, p)
		recent = append(recent, out[i].Words...)
	}
	s.genMu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"portions": out, "round": p.RoundPortions})
}

// POST /api/v1/freetype/results?lang= {wpm, accuracy, chars, perSecond,
// keys, length, device, list} -> one entry in the history of that list.
// {"consistency": 81.4 | null}.
func (s *Server) handleFreetypeResults(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	var req resultsRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		badRequest(w, "invalid JSON")
		return
	}
	req.Samples = nil // Freetype never touches the letter statistics
	if msg := validate(req, s.cfg.MaxEvents, l.Info.Alphabet); msg != "" {
		badRequest(w, msg)
		return
	}
	if !s.validLength(req.Length) {
		badRequest(w, "length: unknown round length")
		return
	}
	if !s.validList(l, req.List) || req.Level != 0 {
		badRequest(w, "list: not offered (or a level, which Freetype has not)")
		return
	}
	var consistency *float64
	if v, ok := engine.Consistency(req.PerSecond, s.cfg.ConsistencyMinSeconds); ok {
		consistency = &v
	}
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	err := s.store.AddFreeplaySession(user, l.Info.ID, storage.FreetypeMode(req.List), storage.Session{
		WPM: req.WPM, Accuracy: req.Accuracy, Chars: req.Chars, Consistency: consistency, FinishedAt: time.Now(),
		Keys:   req.Keys, // kept as the raw record only, never learned from
		Length: req.Length,
		Device: req.Device,
	})
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"consistency": consistency})
}

// GET /api/v1/freetype/stats?lang=&list=&length= -> {"lists" (the lists
// offered), "list", and the history of that list and length (history)}.
// No list = the first one offered.
func (s *Server) handleFreetypeStats(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	length, ok := s.lengthParam(w, r)
	if !ok {
		return
	}
	lists := s.freetypeLists(l)
	list := 0
	if len(lists) > 0 {
		list = lists[0]
	}
	if v := r.URL.Query().Get("list"); v != "" {
		var err error
		if list, err = strconv.Atoi(v); err != nil || !s.validList(l, list) {
			badRequest(w, "list: not offered")
			return
		}
	}
	out, err := s.history(user, l.Info.ID, storage.FreetypeMode(list), length)
	if err != nil {
		serverError(w, err)
		return
	}
	out["lists"], out["list"] = lists, list
	writeJSON(w, http.StatusOK, out)
}
