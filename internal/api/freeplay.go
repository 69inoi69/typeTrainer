// Climb routes, the second mode (internal/freeplay): its words, its own
// history and its level. Open to everyone; nothing sent here changes the
// letter statistics of learning. (The routes keep the mode's first name,
// /freeplay/, from when it was free practice.)

package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"typingtrainer/internal/engine"
	"typingtrainer/internal/freeplay"
	"typingtrainer/internal/storage"
)

// freeplayPortionRequest is the body of /freeplay/portion. Unlike learning,
// it carries no samples: Climb learns nothing about letters. It carries how
// the portion just typed went, for the thermostat (freeplay.NextLevel).
type freeplayPortionRequest struct {
	Recent []string `json:"recent"` // words already in the round, oldest first, as typed
	Start  bool     `json:"start"`  // a new round: AheadPortions + 1 portions, else 1
	// Last: the round has all its words: only move the level, build none.
	// Words: how many words the portion just typed had (0 = a whole
	// portion); a shorter one, the end of a round, moves the level only
	// with at least PartialMin words (freeplay.Params).
	Last  bool `json:"last"`
	Words int  `json:"words"`
	// Level: the level of the round so far (the last answer's "level").
	// Accuracy (percent) and WPM: the portion just typed; Pace: the WPM of
	// the round so far (0 = not known yet). Not used at the start of a round.
	Level    float64 `json:"level"`
	Accuracy float64 `json:"accuracy"`
	WPM      float64 `json:"wpm"`
	Pace     float64 `json:"pace"`
}

// currentLevel is where the user's next round of Climb starts: the level at
// the end of their last round, LevelStart before the first one.
func (s *Server) currentLevel(user string, l *Language) (float64, error) {
	last, err := s.store.RecentFreeplaySessions(user, l.Info.ID, storage.ModeClimb, "", 1)
	if err != nil || len(last) == 0 {
		return s.cfg.Freeplay.LevelStart, err
	}
	return last[0].Level, nil
}

// POST /api/v1/freeplay/portion?lang= -> {"portions": [{"words": [...]}],
// "round": 5, "level": 0.43}. A new round starts at the user's current
// level; later calls move the level by how the portion just typed went and
// build the next words at the new level. Every portion typed is sent, also
// when the round needs no more words ("last": the answer has no portions),
// so the level moves in a round of 10 words too (it used to move only when
// words were asked for: a 10-word round, built at once, never moved it).
func (s *Server) handleFreeplayPortion(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	var req freeplayPortionRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		badRequest(w, "invalid JSON")
		return
	}
	if len(req.Recent) > s.cfg.MaxEvents || req.Words < 0 || req.Words > s.cfg.MaxEvents {
		badRequest(w, "recent or words: out of range")
		return
	}
	if !inRange(req.Level, 0, 1) || !inRange(req.Accuracy, 0, 100) || !inRange(req.WPM, 0, 400) || !inRange(req.Pace, 0, 400) {
		badRequest(w, "level, accuracy, wpm or pace out of range")
		return
	}
	p := s.cfg.Freeplay
	count, level := 1, req.Level
	if req.Start {
		count = min(p.AheadPortions+1, p.RoundPortions)
		var err error
		if level, err = s.currentLevel(user, l); err != nil {
			serverError(w, err)
			return
		}
	} else if req.Words == 0 || req.Words >= p.PartialMin {
		level = freeplay.NextLevel(req.Level, req.Accuracy, req.WPM, req.Pace, p)
	}
	if req.Last {
		count = 0
	}
	type portion struct {
		Words []string `json:"words"`
	}
	out := make([]portion, count)
	recent := append([]string{}, req.Recent...)
	s.genMu.Lock()
	for i := range out {
		out[i].Words = l.Free.Portion(recent, p.PortionWords, level, p)
		recent = append(recent, out[i].Words...)
	}
	s.genMu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"portions": out, "round": p.RoundPortions, "level": level})
}

// inRange: lo <= v <= hi (and not NaN).
func inRange(v, lo, hi float64) bool { return v >= lo && v <= hi }

// climbAlphabet is what may be typed in Climb: the letters of the language
// in both cases, and the punctuation of the layer (freeplay.Portion).
func climbAlphabet(alphabet string) string { return alphabet + strings.ToUpper(alphabet) + ",." }

// POST /api/v1/freeplay/results?lang= {wpm, accuracy, chars, perSecond, keys,
// level} -> one entry in the Climb history, with the level it ended at.
// {"consistency": 81.4 | null}.
func (s *Server) handleFreeplayResults(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	var req resultsRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		badRequest(w, "invalid JSON")
		return
	}
	req.Samples = nil // Climb never touches the letter statistics
	if msg := validate(req, s.cfg.MaxEvents, climbAlphabet(l.Info.Alphabet)); msg != "" {
		badRequest(w, msg)
		return
	}
	if !s.validLength(req.Length) {
		badRequest(w, "length: unknown round length")
		return
	}
	if !inRange(req.Level, 0, 1) {
		badRequest(w, "level: 0..1")
		return
	}
	var consistency *float64
	if v, ok := engine.Consistency(req.PerSecond, s.cfg.ConsistencyMinSeconds); ok {
		consistency = &v
	}
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	err := s.store.AddFreeplaySession(user, l.Info.ID, storage.ModeClimb, storage.Session{
		WPM: req.WPM, Accuracy: req.Accuracy, Chars: req.Chars, Consistency: consistency, FinishedAt: time.Now(),
		Keys:   req.Keys, // kept as the raw record only, never learned from
		Length: req.Length,
		Device: req.Device,
		Level:  req.Level,
	})
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"consistency": consistency})
}

// GET /api/v1/freeplay/stats?lang=&length= -> {"level" (where the next
// round starts), the history of that length (history), "capsFrom",
// "punctFrom" (the levels where those layers start)}.
func (s *Server) handleFreeplayStats(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	length, ok := s.lengthParam(w, r)
	if !ok {
		return
	}
	level, err := s.currentLevel(user, l)
	if err != nil {
		serverError(w, err)
		return
	}
	out, err := s.history(user, l.Info.ID, storage.ModeClimb, length)
	if err != nil {
		serverError(w, err)
		return
	}
	out["level"] = level
	// the levels where capitals and punctuation start, for the texts that name them
	out["capsFrom"], out["punctFrom"] = s.cfg.Freeplay.CapsFrom, s.cfg.Freeplay.PunctFrom
	writeJSON(w, http.StatusOK, out)
}

// history is what the stats screen shows of one mode outside learning:
// "sessions" (the last 50 of the length, newest first, each with its
// level in Climb), "sessionCount" (of the length), "lengths" (every length
// in the history), "bests" (the fastest round of every length). length ""
// = rounds of every length.
func (s *Server) history(user, lang, mode, length string) (map[string]any, error) {
	sessions, err := s.store.RecentFreeplaySessions(user, lang, mode, length, 50)
	if err != nil {
		return nil, err
	}
	count, err := s.store.FreeplaySessionCount(user, lang, mode, length)
	if err != nil {
		return nil, err
	}
	lengths, err := s.store.FreeplaySessionLengths(user, lang, mode)
	if err != nil {
		return nil, err
	}
	bests, err := s.store.BestFreeplayRounds(user, lang, mode)
	if err != nil {
		return nil, err
	}
	return map[string]any{"sessions": summaries(sessions), "sessionCount": count, "lengths": lengths, "bests": bests}, nil
}
