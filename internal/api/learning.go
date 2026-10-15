// Learning routes: the adaptive trainer (internal/engine). The stream of
// portions, the end of a round, the letter statistics.

package api

import (
	"encoding/json"
	"net/http"
	"sort"
	"time"

	"typingtrainer/internal/engine"
	"typingtrainer/internal/storage"
)

type portionRequest struct {
	Samples []engine.Sample `json:"samples"` // the portion just typed (empty at the start)
	Recent  []string        `json:"recent"`  // words already in the stream, oldest first
	Retry   []string        `json:"retry"`   // words typed with a mistake
	Start   bool            `json:"start"`   // a new round: AheadPortions + 1 portions, else 1
	Last    bool            `json:"last"`    // the round has all its portions: only learn, build none
}

// POST /api/v1/portion?lang= -> the stream: learns from the portion just
// typed and builds the next one(s) from the UPDATED statistics.
// Answer: {"portions": [{words, focus, weakest, unlocked, locked}], "newLetter": "s", "round": 5}.
// A new round ({"start": true}) gets the portion to type plus AheadPortions
// waiting after it; later calls get one portion each. "round" = portions per
// round: the browser stops asking when the round has them all.
func (s *Server) handlePortion(w http.ResponseWriter, r *http.Request, l *Language) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var req portionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		badRequest(w, "invalid JSON")
		return
	}
	p := s.cfg.Engine
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
	stats, unlocked, newLetter, err := s.learn(l, req.Samples)
	if err != nil {
		serverError(w, err)
		return
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
		out[i] = l.Gen.Portion(stats, unlocked, recent, req.Retry, p)
		recent = append(recent, out[i].Words...)
		req.Retry = nil // mistyped words come back once, in the first portion
	}
	s.genMu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"portions": out, "newLetter": newLetter, "round": p.RoundPortions})
}

// learn applies samples to the statistics of the language and opens the next
// letter if every open letter is mastered. The caller holds writeMu.
// newLetter is "" if nothing opened.
func (s *Server) learn(l *Language, samples []engine.Sample) (stats map[string]engine.KeyStat, unlocked int, newLetter string, err error) {
	id := l.Info.ID
	if stats, err = s.store.KeyStats(id); err != nil {
		return
	}
	before, err := s.store.Unlocked(id)
	if err != nil {
		return
	}
	before = l.Gen.Clamp(before)
	if len(samples) == 0 {
		return stats, before, "", nil
	}
	stats = engine.Apply(stats, samples, s.cfg.Engine)
	if err = s.store.SaveKeyStats(id, stats); err != nil {
		return
	}
	unlocked = l.Gen.NextUnlocked(stats, before, s.cfg.Engine)
	if err = s.store.SetUnlocked(id, unlocked); err != nil {
		return
	}
	if unlocked > before {
		newLetter = l.Gen.Order()[unlocked-1]
	}
	return
}

type resultsRequest struct {
	Samples  []engine.Sample `json:"samples"`
	WPM      float64         `json:"wpm"`
	Accuracy float64         `json:"accuracy"`
	Chars    int             `json:"chars"` // characters typed in the round (0: len(samples))
	// keypresses in each full second of the round, for engine.Consistency
	PerSecond []int `json:"perSecond"`
}

// POST /api/v1/results?lang= -> the round is over: stores it in the
// history. Samples are the ones not yet sent with /portion (may be empty).
// Answer: {"unlocked": 8, "newLetter": "s", "consistency": 81.4}
// (newLetter is "" if nothing opened; consistency is null for a round too short to judge).
func (s *Server) handleResults(w http.ResponseWriter, r *http.Request, l *Language) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20) // 1 MB is plenty
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

	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	_, unlocked, newLetter, err := s.learn(l, req.Samples)
	if err != nil {
		serverError(w, err)
		return
	}
	var consistency *float64
	if v, ok := engine.Consistency(req.PerSecond, s.cfg.ConsistencyMinSeconds); ok {
		consistency = &v
	}
	err = s.store.AddSession(l.Info.ID, storage.Session{
		WPM: req.WPM, Accuracy: req.Accuracy, Chars: req.Chars, Consistency: consistency, FinishedAt: time.Now(),
	})
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"unlocked": unlocked, "newLetter": newLetter, "consistency": consistency})
}

// POST /api/v1/progress?lang= {"unlockAll": true} -> for people who can already
// touch type: skip the lessons and open every letter. {"unlockAll": false}
// goes back to the first lesson (statistics are kept).
func (s *Server) handleProgress(w http.ResponseWriter, r *http.Request, l *Language) {
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
	if err := s.store.SetUnlocked(l.Info.ID, n); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"unlocked": n})
}

type keyInfo struct {
	Char       string  `json:"char"`
	Count      int     `json:"count"`
	ErrorRate  float64 `json:"errorRate"` // smoothed (EMA)
	AvgMs      float64 `json:"avgMs"`     // smoothed (EMA)
	Difficulty float64 `json:"difficulty"`
	Mastered   bool    `json:"mastered"`
	Unlocked   bool    `json:"unlocked"`
}

// GET /api/v1/stats?lang= -> every letter (hardest first), the last 50 sessions
// (newest first) and the total number of finished exercises.
func (s *Server) handleStats(w http.ResponseWriter, r *http.Request, l *Language) {
	id := l.Info.ID
	stats, err := s.store.KeyStats(id)
	if err != nil {
		serverError(w, err)
		return
	}
	unlocked, err := s.store.Unlocked(id)
	if err != nil {
		serverError(w, err)
		return
	}
	unlocked = l.Gen.Clamp(unlocked)
	p := s.cfg.Engine
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
	sessions, err := s.store.RecentSessions(id, 50)
	if err != nil {
		serverError(w, err)
		return
	}
	count, err := s.store.SessionCount(id)
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"lang": id, "keys": keys, "sessions": sessions, "sessionCount": count, "targetWpm": p.TargetWPM,
	})
}
