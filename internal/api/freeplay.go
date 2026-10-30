// Climb routes.

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

type freeplayPortionRequest struct {
	Recent []string `json:"recent"`
	Start  bool     `json:"start"`
	Words  int      `json:"words"`
	Level  int      `json:"level"`
}

func (s *Server) standing(user string, l *Language) (freeplay.Place, error) {
	p := s.cfg.Freeplay
	last, err := s.store.RecentFreeplaySessions(user, l.Info.ID, storage.ModeClimb, "", p.History)
	if err != nil {
		return freeplay.Place{}, err
	}
	rounds := make([]freeplay.Round, len(last))
	for i, r := range last {
		rounds[len(last)-1-i] = freeplay.Round{Level: int(r.Level), Accuracy: r.Accuracy}
	}
	return freeplay.Standing(rounds, p), nil
}

func (s *Server) validLevel(level int) bool { return level >= 1 && level <= len(s.cfg.Freeplay.Levels) }

func (s *Server) validStartWords(n int) bool { return n >= 0 && n <= s.cfg.Freeplay.MaxStartWords }

func (s *Server) startPortions(start bool, words int) int {
	if !start || words <= 0 {
		return 1
	}
	p := s.cfg.Freeplay
	return (words + p.PortionWords - 1) / p.PortionWords
}

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

func (s *Server) handleFreeplayPortion(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	var req freeplayPortionRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, int64(s.cfg.MaxBodyBytes))).Decode(&req); err != nil {
		badRequest(w, "invalid JSON")
		return
	}
	if len(req.Recent) > s.cfg.MaxEvents {
		badRequest(w, "recent: out of range")
		return
	}
	if !s.validStartWords(req.Words) {
		badRequest(w, "words: out of range")
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
	count := s.startPortions(req.Start, req.Words)
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
	writeJSON(w, http.StatusOK, map[string]any{"portions": out, "level": level})
}

func inRange(v, lo, hi float64) bool { return v >= lo && v <= hi }

func climbAlphabet(alphabet string) string { return alphabet + strings.ToUpper(alphabet) + ",." }

func (s *Server) handleFreeplayResults(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	var req resultsRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, int64(s.cfg.MaxBodyBytes))).Decode(&req); err != nil {
		badRequest(w, "invalid JSON")
		return
	}
	req.Samples = nil
	if msg := validate(req, s.cfg.MaxRoundChars, s.cfg.MaxEvents, climbAlphabet(l.Info.Alphabet)); msg != "" {
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
		Keys:   req.Keys,
		Length: req.Length,
		Device: req.Device,
		Level:  req.Level,
		Round:  req.Round,
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
	levels := make([]int, len(p.Levels))
	for i := range levels {
		levels[i] = l.Free.MaxRank(i+1, p)
	}
	out["place"], out["levels"] = at, levels
	out["passesUp"], out["failsDown"], out["passAccuracy"], out["failAccuracy"] = p.PassesUp, p.FailsDown, p.PassAccuracy, p.FailAccuracy
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) history(user, lang, mode, length string) (map[string]any, error) {
	count, err := s.store.FreeplaySessionCount(user, lang, mode, length)
	if err != nil {
		return nil, err
	}
	all, err := s.store.RecentFreeplaySessions(user, lang, mode, length, count)
	if err != nil {
		return nil, err
	}
	sessions := slices.Clone(all[:min(len(all), 50)])
	slices.Reverse(all)
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
