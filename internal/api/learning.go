// Learn routes.

package api

import (
	"encoding/json"
	"net/http"
	"slices"
	"sort"
	"strconv"
	"time"

	"typingtrainer/internal/engine"
	"typingtrainer/internal/history"
	"typingtrainer/internal/storage"
)

type portionRequest struct {
	Samples []engine.Sample `json:"samples"`
	Recent  []string        `json:"recent"`
	Retry   []string        `json:"retry"`
	Start   bool            `json:"start"`
	Last    bool            `json:"last"`
}

func (s *Server) handlePortion(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var req portionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		badRequest(w, "invalid JSON")
		return
	}
	if msg := validateSamples(req.Samples, s.cfg.MaxEvents, l.Info.Alphabet); msg != "" {
		badRequest(w, msg)
		return
	}
	if len(req.Recent) > s.cfg.MaxEvents || len(req.Retry) > s.cfg.MaxEvents {
		badRequest(w, "recent or retry: too long")
		return
	}

	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	done, err := s.learn(user, l, req.Samples)
	if err != nil {
		serverError(w, err)
		return
	}
	if done.changed {
		if err := s.store.SaveLearned(user, l.Info.ID, done.record(nil)); err != nil {
			serverError(w, err)
			return
		}
	}
	stats, unlocked := done.stats, done.unlocked
	p := s.cfg.Engine.ForLap(done.lapAfter, s.cfg.Laps)
	group, err := s.store.Group(user, l.Info.ID)
	if err != nil {
		serverError(w, err)
		return
	}
	typed := 0
	if all := len(l.Gen.Order()); unlocked == all {
		if typed, err = s.store.LettersTyped(user, l.Info.ID, all); err != nil {
			serverError(w, err)
			return
		}
	}
	recent := append([]string{}, req.Recent...)
	count := 1
	if req.Last {
		count = 0
	} else if req.Start {
		count = min(p.AheadPortions+1, p.RoundPortions)
	}
	out := make([]engine.Portion, count)
	s.genMu.Lock()
	for i := range out {
		if group == storage.GroupRandom {
			last := ""
			if len(recent) > 0 {
				last = recent[len(recent)-1]
			}
			out[i] = l.Gen.RandomPortion(unlocked, last, p)
			recent = append(recent, out[i].Words...)
			continue
		}
		out[i] = l.Gen.Portion(stats, unlocked, typed, recent, req.Retry, p)
		recent = append(recent, out[i].Words...)
		req.Retry = nil
	}
	s.genMu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"portions": out, "newLetter": done.newLetter, "round": p.RoundPortions, "newLap": newLap(done, p)})
}

func (s *Server) lapParams(user, lang string) (engine.Params, int, error) {
	lap, err := s.store.Lap(user, lang)
	if err != nil {
		return engine.Params{}, 0, err
	}
	lap = min(max(lap, 0), s.cfg.Engine.LastLap(s.cfg.Laps))
	return s.cfg.Engine.ForLap(lap, s.cfg.Laps), lap, nil
}

type learned struct {
	stats         map[string]engine.KeyStat
	unlocked      int
	newLetter     string
	lap, lapAfter int
	changed       bool
}

func (done learned) record(round *storage.Session) storage.Learned {
	out := storage.Learned{Unlocked: done.unlocked, Lap: done.lapAfter, Session: round}
	if done.changed {
		out.Stats = done.stats
	}
	return out
}

func (s *Server) learn(user string, l *Language, samples []engine.Sample) (out learned, err error) {
	id := l.Info.ID
	p, lap, err := s.lapParams(user, id)
	if err != nil {
		return
	}
	out.lap, out.lapAfter = lap, lap
	if out.stats, err = s.store.KeyStats(user, id); err != nil {
		return
	}
	before, err := s.store.Unlocked(user, id)
	if err != nil {
		return
	}
	before = l.Gen.Clamp(before)
	out.unlocked = before
	if len(samples) == 0 {
		return
	}
	out.changed = true
	out.stats = engine.Apply(out.stats, samples, p)
	out.unlocked = l.Gen.NextUnlocked(out.stats, before, p)
	if out.unlocked > before {
		out.newLetter = l.Gen.Order()[out.unlocked-1]
	}
	if lap < s.cfg.Engine.LastLap(s.cfg.Laps) && engine.LapDone(out.stats, l.Gen.Order(), out.unlocked, p) {
		out.stats, out.lapAfter = engine.StartLap(out.stats), lap+1
	}
	return
}

func newLap(done learned, p engine.Params) float64 {
	if done.lapAfter > done.lap {
		return p.TargetWPM
	}
	return 0
}

type resultsRequest struct {
	Samples   []engine.Sample `json:"samples"`
	Keys      []engine.Sample `json:"keys"`
	WPM       float64         `json:"wpm"`
	Accuracy  float64         `json:"accuracy"`
	Chars     int             `json:"chars"`
	PerSecond []int           `json:"perSecond"`
	Length    string          `json:"length"`
	Device    string          `json:"device"`
	Level     float64         `json:"level"`
	List      int             `json:"list"`
	Variant   string          `json:"variant"`
	Round     string          `json:"round"`
}

func (s *Server) handleResults(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var req resultsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		badRequest(w, "invalid JSON")
		return
	}
	if req.Chars == 0 {
		req.Chars = len(req.Samples)
	}
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
	again, err := s.store.HasRound(user, l.Info.ID, req.Round)
	if err != nil {
		serverError(w, err)
		return
	}
	if again {
		req.Samples = nil
	}
	done, err := s.learn(user, l, req.Samples)
	if err != nil {
		serverError(w, err)
		return
	}
	var consistency *float64
	if v, ok := engine.Consistency(req.PerSecond, s.cfg.ConsistencyMinSeconds); ok {
		consistency = &v
	}
	group, err := s.store.Group(user, l.Info.ID)
	if err != nil {
		serverError(w, err)
		return
	}
	err = s.store.SaveLearned(user, l.Info.ID, done.record(&storage.Session{
		WPM: req.WPM, Accuracy: req.Accuracy, Chars: req.Chars, Consistency: consistency, FinishedAt: time.Now(),
		Keys: req.Keys, Unlocked: done.unlocked, Length: req.Length, Group: group, Device: req.Device,
		Lap:   done.lap,
		Round: req.Round,
	}))
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"unlocked": done.unlocked, "newLetter": done.newLetter, "consistency": consistency,
		"newLap": newLap(done, s.cfg.Engine.ForLap(done.lapAfter, s.cfg.Laps))})
}

func (s *Server) handleProgress(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	var req struct {
		UnlockAll bool `json:"unlockAll"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&req); err != nil {
		badRequest(w, "invalid JSON")
		return
	}
	n := l.Gen.Start()
	if req.UnlockAll {
		n = len(l.Gen.Order())
	}
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	if err := s.store.SetUnlocked(user, l.Info.ID, n); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"unlocked": n})
}

type keyInfo struct {
	Char       string  `json:"char"`
	Count      int     `json:"count"`
	ErrorRate  float64 `json:"errorRate"`
	AvgMs      float64 `json:"avgMs"`
	Difficulty float64 `json:"difficulty"`
	Mastered   bool    `json:"mastered"`
	Unlocked   bool    `json:"unlocked"`
}

func (s *Server) handleStats(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	id := l.Info.ID
	length, ok := s.lengthParam(w, r)
	if !ok {
		return
	}
	stats, err := s.store.KeyStats(user, id)
	if err != nil {
		serverError(w, err)
		return
	}
	unlocked, err := s.store.Unlocked(user, id)
	if err != nil {
		serverError(w, err)
		return
	}
	unlocked = l.Gen.Clamp(unlocked)
	p, lap, err := s.lapParams(user, id)
	if err != nil {
		serverError(w, err)
		return
	}
	keys := []keyInfo{}
	for i, c := range l.Gen.Order() {
		st := stats[c]
		keys = append(keys, keyInfo{
			Char: c, Count: st.Count, ErrorRate: st.ErrEMA, AvgMs: st.TimeEMA,
			Difficulty: engine.Difficulty(st, p), Mastered: engine.Mastered(st, p),
			Unlocked: i < unlocked,
		})
	}
	sort.SliceStable(keys, func(i, j int) bool { return keys[i].Difficulty > keys[j].Difficulty })
	sessions, err := s.store.RecentSessions(user, id, length, 50)
	if err != nil {
		serverError(w, err)
		return
	}
	count, err := s.store.SessionCount(user, id, length)
	if err != nil {
		serverError(w, err)
		return
	}
	lengths, err := s.store.SessionLengths(user, id)
	if err != nil {
		serverError(w, err)
		return
	}
	group, err := s.store.Group(user, id)
	if err != nil {
		serverError(w, err)
		return
	}
	bests, err := s.store.BestRounds(user, id)
	if err != nil {
		serverError(w, err)
		return
	}
	all, err := s.store.RecentSessions(user, id, length, count)
	if err != nil {
		serverError(w, err)
		return
	}
	slices.Reverse(all)
	every, err := s.allLearning(user, id)
	if err != nil {
		serverError(w, err)
		return
	}
	rounds := history.LetterTimeline(every, l.Gen.Order(), l.Gen.Start(), s.cfg.Engine, s.cfg.Laps)
	writeJSON(w, http.StatusOK, map[string]any{
		"forecast": history.NextForecast(rounds, l.Gen.Order(), stats, unlocked, p, s.cfg.Forecast),
		"lap":      lap, "lastLap": s.cfg.Engine.LastLap(s.cfg.Laps),
		"streaks": history.AccuracyStreaks(all, s.cfg.StreakAccuracies),
		"order":   l.Gen.Order(),
		"lang":    id, "keys": keys, "sessions": summaries(sessions), "sessionCount": count, "targetWpm": p.TargetWPM,
		"masteryMin": p.MasteryMinSamples, "masteryErr": p.MasteryErrorRate * 100,
		"lengths": lengths, "group": group, "bests": bests,
		"learnRounds": len(every),
	})
}

func (s *Server) allLearning(user, lang string) ([]storage.Session, error) {
	count, err := s.store.SessionCount(user, lang, "")
	if err != nil {
		return nil, err
	}
	all, err := s.store.RecentSessions(user, lang, "", count)
	slices.Reverse(all)
	return all, err
}

func (s *Server) handleLearnHistory(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	all, err := s.allLearning(user, l.Info.ID)
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"order":      l.Gen.Order(),
		"rounds":     history.LetterTimeline(all, l.Gen.Order(), l.Gen.Start(), s.cfg.Engine, s.cfg.Laps),
		"confusions": history.Confusions(all, s.cfg.ConfusionMin, s.cfg.ConfusionShown),
	})
}

func (s *Server) handleActivity(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	tz := 0
	if v := r.URL.Query().Get("tz"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < -maxTZMinutes || n > maxTZMinutes {
			badRequest(w, "tz: minutes from UTC, -840 to 840")
			return
		}
		tz = n
	}
	days, err := s.store.PracticeDays(user, l.Info.ID, time.Duration(tz)*time.Minute)
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"days": days})
}

const maxTZMinutes = 14 * 60

func (s *Server) validLength(length string) bool {
	return validLength(length, s.cfg.MaxRoundWords, s.cfg.MaxRoundSeconds)
}

func (s *Server) lengthParam(w http.ResponseWriter, r *http.Request) (string, bool) {
	length := r.URL.Query().Get("length")
	if !s.validLength(length) {
		badRequest(w, "length: unknown round length")
		return "", false
	}
	return length, true
}
