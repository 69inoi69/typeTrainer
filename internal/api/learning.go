// Learning routes: the adaptive trainer (internal/engine). The stream of
// portions, the end of a round, the letter statistics.

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

// portionRequest is the body of /portion: what the browser typed since the
// last call, and what is already on the screen (so no word repeats too soon).
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

	// learn reads, changes and saves the statistics: writeMu makes that one
	// step, so two quick calls cannot both start from the old numbers
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	done, err := s.learn(user, l, req.Samples)
	if err != nil {
		serverError(w, err)
		return
	}
	stats, unlocked := done.stats, done.unlocked
	p := s.cfg.Engine.ForLap(done.lapAfter, s.cfg.Laps) // the words of the next portions practise for the new goal
	group, err := s.store.Group(user, l.Info.ID)
	if err != nil {
		serverError(w, err)
		return
	}
	typed := 0 // letters typed since every letter was open: how far MaxRank has grown
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
	// the generator's random source is shared by every request
	s.genMu.Lock()
	for i := range out {
		if group == storage.GroupRandom { // the control group of a study: random open words
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
		req.Retry = nil // mistyped words come back once, in the first portion
	}
	s.genMu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"portions": out, "newLetter": done.newLetter, "round": p.RoundPortions, "newLap": newLap(done, p)})
}

// lapParams are the model's parameters at the user's lap in language
// lang (engine.Params.ForLap: the goal speed of that lap), and the lap.
func (s *Server) lapParams(user, lang string) (engine.Params, int, error) {
	lap, err := s.store.Lap(user, lang)
	if err != nil {
		return engine.Params{}, 0, err
	}
	lap = min(max(lap, 0), s.cfg.Engine.LastLap(s.cfg.Laps))
	return s.cfg.Engine.ForLap(lap, s.cfg.Laps), lap, nil
}

// learned is what learn did: the statistics after it, the letters open,
// the letter it opened ("" = none), the lap the samples were typed in and
// the lap after them (one more when they finished a lap).
type learned struct {
	stats         map[string]engine.KeyStat
	unlocked      int
	newLetter     string
	lap, lapAfter int
}

// learn applies samples to the statistics of the language and opens the next
// letter if every open letter is mastered; with every letter open and
// mastered it starts the next lap (engine.LapDone, StartLap), unless this
// was the last. The caller holds writeMu.
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
	out.stats = engine.Apply(out.stats, samples, p)
	out.unlocked = l.Gen.NextUnlocked(out.stats, before, p)
	if out.unlocked > before {
		out.newLetter = l.Gen.Order()[out.unlocked-1]
	}
	if lap < s.cfg.Engine.LastLap(s.cfg.Laps) && engine.LapDone(out.stats, l.Gen.Order(), out.unlocked, p) {
		out.stats, out.lapAfter = engine.StartLap(out.stats), lap+1
		if err = s.store.SetLap(user, id, out.lapAfter); err != nil {
			return
		}
	}
	if err = s.store.SaveKeyStats(user, id, out.stats); err != nil {
		return
	}
	err = s.store.SetUnlocked(user, id, out.unlocked)
	return
}

// newLap is the goal speed of the lap learn just started (0 = none
// started): the browser tells the typist (learnpanel.js).
func newLap(done learned, p engine.Params) float64 {
	if done.lapAfter > done.lap {
		return p.TargetWPM
	}
	return 0
}

// resultsRequest is the body of /results, and (without Samples) of
// /freeplay/results (with Level) and /freetype/results (with List).
type resultsRequest struct {
	// Samples: the keypresses not yet learned with /portion. The model
	// learns from these.
	Samples []engine.Sample `json:"samples"`
	// Keys: every keypress of the round, in order (the raw record kept in
	// the history; learned samples included). Optional: older pages do not
	// send it. Never learned from, so no keypress is counted twice.
	Keys     []engine.Sample `json:"keys"`
	WPM      float64         `json:"wpm"`
	Accuracy float64         `json:"accuracy"`
	Chars    int             `json:"chars"` // characters typed in the round (0: len(samples))
	// keypresses in each full second of the round, for engine.Consistency
	PerSecond []int `json:"perSecond"`
	// Length: the round length chosen in the settings ("words-30",
	// "time-60"); "" = storage.DefaultLength.
	Length string `json:"length"`
	// Device: what the round was typed on, storage.DeviceKeyboard or
	// storage.DeviceTouch; "" = not sent (older pages). Recorded only.
	Device string `json:"device"`
	// Level: Climb only, the level the round was typed at (1..10).
	Level float64 `json:"level"`
	// List: Freetype only, the word list of the round (its n most common
	// words, one of Server.freetypeLists).
	List int `json:"list"`
	// Variant: Freetype only, the kind of round (storage.FreetypeVariants).
	Variant string `json:"variant"`
}

// POST /api/v1/results?lang= -> the round is over: stores it in the
// history. Samples are the ones not yet sent with /portion (may be empty);
// keys are all keypresses of the round, kept as its raw record.
// Answer: {"unlocked": 8, "newLetter": "s", "consistency": 81.4}
// (newLetter is "" if nothing opened; consistency is null for a round too short to judge).
func (s *Server) handleResults(w http.ResponseWriter, r *http.Request, user string, l *Language) {
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
	if !s.validLength(req.Length) {
		badRequest(w, "length: unknown round length")
		return
	}

	s.writeMu.Lock()
	defer s.writeMu.Unlock()
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
	err = s.store.AddSession(user, l.Info.ID, storage.Session{
		WPM: req.WPM, Accuracy: req.Accuracy, Chars: req.Chars, Consistency: consistency, FinishedAt: time.Now(),
		Keys: req.Keys, Unlocked: done.unlocked, Length: req.Length, Group: group, Device: req.Device,
		Lap: done.lap, // the lap the round was typed in, even when its last keys finished it
	})
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"unlocked": done.unlocked, "newLetter": done.newLetter, "consistency": consistency,
		"newLap": newLap(done, s.cfg.Engine.ForLap(done.lapAfter, s.cfg.Laps))})
}

// POST /api/v1/progress?lang= {"unlockAll": true} -> opens every letter;
// {"unlockAll": false} goes back to the first lesson (statistics are kept).
// For development and tests only: the interface does not call it, because
// everyone starts from the first letters (AGENTS.md, product decisions).
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

// keyInfo is one letter in the answer of /stats.
type keyInfo struct {
	Char       string  `json:"char"`
	Count      int     `json:"count"`
	ErrorRate  float64 `json:"errorRate"` // smoothed (EMA)
	AvgMs      float64 `json:"avgMs"`     // smoothed (EMA)
	Difficulty float64 `json:"difficulty"`
	Mastered   bool    `json:"mastered"`
	Unlocked   bool    `json:"unlocked"`
}

// GET /api/v1/stats?lang=&length= -> every letter (hardest first), the last 50
// rounds of that length (newest first, without their raw keys), how many
// rounds of that length there are, every length found in the history
// ("lengths") and the fastest round of every length ("bests", the personal
// bests on top of the stats screen). No length = rounds of every length.
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
	// the accuracy streaks look at every round of the length
	all, err := s.store.RecentSessions(user, id, length, count)
	if err != nil {
		serverError(w, err)
		return
	}
	slices.Reverse(all) // oldest first
	// the forecast reads every round, of every length: a letter learns in all
	every, err := s.allLearning(user, id)
	if err != nil {
		serverError(w, err)
		return
	}
	rounds := history.LetterTimeline(every, l.Gen.Order(), l.Gen.Start(), s.cfg.Engine, s.cfg.Laps)
	writeJSON(w, http.StatusOK, map[string]any{
		"forecast": history.NextForecast(rounds, l.Gen.Order(), stats, unlocked, p, s.cfg.Forecast),
		// Learn's lap (0 = the first) and the last one there is; targetWpm is the lap's goal
		"lap": lap, "lastLap": s.cfg.Engine.LastLap(s.cfg.Laps),
		"streaks": history.AccuracyStreaks(all, s.cfg.StreakAccuracies),
		"order":   l.Gen.Order(), // the unlock order: the chart names the letters a round opened
		"lang":    id, "keys": keys, "sessions": summaries(sessions), "sessionCount": count, "targetWpm": p.TargetWPM,
		// the mastery rule, for the texts that explain it (engine.Mastered)
		"masteryMin": p.MasteryMinSamples, "masteryErr": p.MasteryErrorRate * 100,
		"lengths": lengths, "group": group, "bests": bests,
		// Learn rounds of every length, for "Round 48" above the word counter
		"learnRounds": len(every),
	})
}

// allLearning is every Learn round of every length, oldest first.
func (s *Server) allLearning(user, lang string) ([]storage.Session, error) {
	count, err := s.store.SessionCount(user, lang, "")
	if err != nil {
		return nil, err
	}
	all, err := s.store.RecentSessions(user, lang, "", count)
	slices.Reverse(all)
	return all, err
}

// GET /api/v1/learn/history?lang= -> {"order": the letters in the order
// they open, "rounds": every Learn round oldest first with each open
// letter's numbers after it (history.LetterTimeline), "confusions": the
// keys mixed up most (history.Confusions)}: the Learn part of the stats
// screen. Every length together: a letter learns in every round.
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

// GET /api/v1/activity?lang=&tz= -> {days: [{date, rounds, seconds, chars}]}:
// every day with a finished round, learning and free practice together,
// oldest first (the stats screen's time typing, days in a row and activity
// calendar). tz: the browser's offset from UTC in minutes, east positive
// (-Date.getTimezoneOffset()), so the days end at the user's midnight.
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

// maxTZMinutes: the farthest time zones are 14 hours from UTC.
const maxTZMinutes = 14 * 60

// validLength checks a round length against the limits in the config
// (MaxRoundWords, MaxRoundSeconds); the rule itself is in validate.go.
func (s *Server) validLength(length string) bool {
	return validLength(length, s.cfg.MaxRoundWords, s.cfg.MaxRoundSeconds)
}

// lengthParam reads ?length= of a stats request ("" = every length). On a
// wrong value it answers 400 itself and returns false.
func (s *Server) lengthParam(w http.ResponseWriter, r *http.Request) (string, bool) {
	length := r.URL.Query().Get("length")
	if !s.validLength(length) {
		badRequest(w, "length: unknown round length")
		return "", false
	}
	return length, true
}
