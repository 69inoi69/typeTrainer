// Climb routes, the second mode (internal/freeplay): its words, its own
// history and its levels. Open to everyone; nothing sent here changes the
// letter statistics of learning. (The routes keep the mode's first name,
// /freeplay/, from when it was free practice.)

package api

import (
	"encoding/json"
	"math"
	"net/http"
	"slices"
	"strings"
	"time"

	"typingtrainer/internal/engine"
	"typingtrainer/internal/freeplay"
	"typingtrainer/internal/history"
	"typingtrainer/internal/storage"
)

// freeplayPortionRequest is the body of /freeplay/portion. Unlike learning,
// it carries no samples: Climb learns nothing about letters.
type freeplayPortionRequest struct {
	Recent []string `json:"recent"` // words already in the round, oldest first
	Start  bool     `json:"start"`  // a new round: AheadPortions + 1 portions, else 1
	// Level: the level of the round, 1..len(Levels); 0 = where the user
	// stands (standing). The whole round is typed at one level.
	Level int `json:"level"`
}

// standing is where the user stands in Climb (freeplay.Standing): the level
// of their next round and how far they are on it, from their last History
// rounds.
func (s *Server) standing(user string, l *Language) (freeplay.Place, error) {
	p := s.cfg.Freeplay
	last, err := s.store.RecentFreeplaySessions(user, l.Info.ID, storage.ModeClimb, "", p.History)
	if err != nil {
		return freeplay.Place{}, err
	}
	rounds := make([]freeplay.Round, len(last))
	for i, r := range last { // newest first -> oldest first
		rounds[len(last)-1-i] = freeplay.Round{Level: int(r.Level), Accuracy: r.Accuracy}
	}
	return freeplay.Standing(rounds, p), nil
}

// validLevel: a Climb level, 1..len(Levels).
func (s *Server) validLevel(level int) bool { return level >= 1 && level <= len(s.cfg.Freeplay.Levels) }

// weakPairs: the user's weak letter pairs from the raw keys of their last
// WeakRounds Climb rounds (freeplay.WeakPairs). Climb's own history only:
// learning's rounds never count here.
func (s *Server) weakPairs(user string, l *Language) ([]freeplay.Pair, error) {
	rounds, err := s.store.RecentFreeplaySessions(user, l.Info.ID, storage.ModeClimb, "", s.cfg.Freeplay.WeakRounds)
	if err != nil {
		return nil, err
	}
	keys := make([][]freeplay.Key, len(rounds))
	for i, r := range rounds {
		keys[i] = make([]freeplay.Key, len(r.Keys))
		for j, k := range r.Keys {
			keys[i][j] = freeplay.Key{Char: k.Char, Errors: k.Errors, Ms: k.Ms}
		}
	}
	return freeplay.WeakPairs(keys, s.cfg.Freeplay), nil
}

// POST /api/v1/freeplay/portion?lang= -> {"portions": [{"words": [...]}],
// "round": 5, "level": 4}: the next words of a round at its level (the
// level sent, or where the user stands). Part of the words carry the
// user's weak pairs (weakPairs; none while there is too little history).
func (s *Server) handleFreeplayPortion(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	var req freeplayPortionRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		badRequest(w, "invalid JSON")
		return
	}
	if len(req.Recent) > s.cfg.MaxEvents {
		badRequest(w, "recent: out of range")
		return
	}
	if req.Level != 0 && !s.validLevel(req.Level) {
		badRequest(w, "level: out of range")
		return
	}
	p := s.cfg.Freeplay
	level := req.Level
	if level == 0 {
		at, err := s.standing(user, l)
		if err != nil {
			serverError(w, err)
			return
		}
		level = at.Level
	}
	count := 1
	if req.Start {
		count = min(p.AheadPortions+1, p.RoundPortions)
	}
	pairs, err := s.weakPairs(user, l)
	if err != nil {
		serverError(w, err)
		return
	}
	var weak []string
	for _, p := range pairs {
		weak = append(weak, p.Pair)
	}
	type portion struct {
		Words []string `json:"words"`
	}
	out := make([]portion, count)
	recent := append([]string{}, req.Recent...)
	s.genMu.Lock()
	for i := range out {
		out[i].Words = l.Free.Portion(recent, p.PortionWords, level, weak, p)
		recent = append(recent, out[i].Words...)
	}
	s.genMu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"portions": out, "round": p.RoundPortions, "level": level})
}

// inRange: lo <= v <= hi (and not NaN).
func inRange(v, lo, hi float64) bool { return v >= lo && v <= hi }

// climbAlphabet is what a Climb round may hold: the letters of the
// language. Capitals and the marks "," and "." too, for the rounds typed
// before 2026-10-20, when Climb had them (they are still imported).
func climbAlphabet(alphabet string) string { return alphabet + strings.ToUpper(alphabet) + ",." }

// POST /api/v1/freeplay/results?lang= {wpm, accuracy, chars, perSecond, keys,
// level} -> one entry in the Climb history, with the level it was typed at.
// {"consistency": 81.4 | null, "weak": [{"pair": "ck", "cost": 412, "count": 31}],
// "verdict": "pass" | "hold" | "fail", "place": {"level", "passes", "fails", "moved"}}:
// weak are the weak pairs with this round counted (none while there is too
// little history); verdict what the round said (freeplay.Judge), place
// where it leaves the user (freeplay.Standing), for the result screen.
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
	if req.Level != math.Trunc(req.Level) || !s.validLevel(int(req.Level)) {
		badRequest(w, "level: a whole number, 1..10")
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
		Round:  req.Round, // sent again: not stored twice, the answer is the same
	})
	if err != nil {
		serverError(w, err)
		return
	}
	weak, err := s.weakPairs(user, l)
	if err != nil {
		serverError(w, err)
		return
	}
	if weak == nil {
		weak = []freeplay.Pair{}
	}
	at, err := s.standing(user, l)
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"consistency": consistency, "weak": weak,
		"verdict": freeplay.Judge(req.Accuracy, s.cfg.Freeplay), "place": at})
}

// GET /api/v1/freeplay/stats?lang=&length= -> {"place" (where the user
// stands: freeplay.Standing), the history of that length (history),
// "levels" (the words of every level, freeplay.Params.Levels), "passesUp",
// "failsDown", "passAccuracy", "failAccuracy" (the rule, for the texts that
// explain it)}.
func (s *Server) handleFreeplayStats(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	length, ok := s.lengthParam(w, r)
	if !ok {
		return
	}
	at, err := s.standing(user, l)
	if err != nil {
		serverError(w, err)
		return
	}
	out, err := s.history(user, l.Info.ID, storage.ModeClimb, length)
	if err != nil {
		serverError(w, err)
		return
	}
	p := s.cfg.Freeplay
	levels := make([]int, len(p.Levels)) // what each level really draws from (a short list caps it)
	for i := range levels {
		levels[i] = l.Free.MaxRank(i+1, p)
	}
	out["place"], out["levels"] = at, levels
	out["passesUp"], out["failsDown"], out["passAccuracy"], out["failAccuracy"] = p.PassesUp, p.FailsDown, p.PassAccuracy, p.FailAccuracy
	writeJSON(w, http.StatusOK, out)
}

// history is what the stats screen shows of one mode outside learning:
// "sessions" (the last 50 of the length, newest first, each with its
// level in Climb), "sessionCount" (of the length), "streaks" (the accuracy
// streaks of the length, history.AccuracyStreaks), "lengths" (every length
// in the history), "bests" (the fastest round of every length). length ""
// = rounds of every length.
func (s *Server) history(user, lang, mode, length string) (map[string]any, error) {
	count, err := s.store.FreeplaySessionCount(user, lang, mode, length)
	if err != nil {
		return nil, err
	}
	// every round of the length: the streaks look at the whole history
	all, err := s.store.RecentFreeplaySessions(user, lang, mode, length, count)
	if err != nil {
		return nil, err
	}
	sessions := slices.Clone(all[:min(len(all), 50)]) // a copy: all is turned round below
	slices.Reverse(all)                               // oldest first
	streaks := history.AccuracyStreaks(all, s.cfg.StreakAccuracies)
	lengths, err := s.store.FreeplaySessionLengths(user, lang, mode)
	if err != nil {
		return nil, err
	}
	bests, err := s.store.BestFreeplayRounds(user, lang, mode)
	if err != nil {
		return nil, err
	}
	return map[string]any{"sessions": summaries(sessions), "sessionCount": count, "lengths": lengths, "bests": bests, "streaks": streaks}, nil
}
