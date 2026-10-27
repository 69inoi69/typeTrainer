// Freetype routes.

package api

import (
	"encoding/json"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"typingtrainer/internal/engine"
	"typingtrainer/internal/storage"
)

func (s *Server) freetypeLists(l *Language) []int {
	out := []int{}
	for _, n := range s.cfg.Freeplay.FreetypeLists {
		if n <= l.Freetype.Size() {
			out = append(out, n)
		}
	}
	return out
}

func (s *Server) validList(l *Language, n int) bool {
	for _, m := range s.freetypeLists(l) {
		if m == n {
			return true
		}
	}
	return false
}

func (s *Server) freetypeKeys(l *Language) []string {
	out := []string{}
	for _, n := range s.freetypeLists(l) {
		for _, v := range storage.FreetypeVariants {
			if !storage.Listless(v) {
				out = append(out, storage.FreetypeKey(n, v))
			}
		}
	}
	if l.Sentences != nil {
		out = append(out, storage.FreetypeKey(0, storage.VariantSentences))
	}
	return append(out, storage.FreetypeKey(0, storage.VariantCustom))
}

func (s *Server) validVariant(l *Language, n int, v string) bool {
	switch {
	case v == storage.VariantSentences:
		return n == 0 && l.Sentences != nil
	case storage.Listless(v):
		return n == 0
	}
	return slices.Contains(storage.FreetypeVariants, v) && s.validList(l, n)
}

func (s *Server) freetypeAlphabet(alphabet string) string {
	return alphabet + strings.ToUpper(alphabet) + s.cfg.Freeplay.TextMarks
}

func (s *Server) handleFreetypePortion(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	var req struct {
		Recent  []string `json:"recent"`
		Start   bool     `json:"start"`
		List    int      `json:"list"`
		Variant string   `json:"variant"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		badRequest(w, "invalid JSON")
		return
	}
	if len(req.Recent) > s.cfg.MaxEvents {
		badRequest(w, "recent: too long")
		return
	}
	if req.Variant == storage.VariantCustom || !s.validVariant(l, req.List, req.Variant) {
		badRequest(w, "list or variant: not offered")
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
		if req.Variant == storage.VariantSentences {
			out[i].Words = l.Sentences.Portion(recent, p.PortionWords, p)
		} else {
			out[i].Words = l.Freetype.Freetype(recent, p.PortionWords, req.List, req.Variant == storage.VariantLong, p)
		}
		recent = append(recent, out[i].Words...)
	}
	s.genMu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"portions": out, "round": p.RoundPortions})
}

func (s *Server) handleFreetypeResults(w http.ResponseWriter, r *http.Request, user string, l *Language) {
	var req resultsRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		badRequest(w, "invalid JSON")
		return
	}
	req.Samples = nil
	if msg := validate(req, s.cfg.MaxEvents, s.freetypeAlphabet(l.Info.Alphabet)); msg != "" {
		badRequest(w, msg)
		return
	}
	if !s.validLength(req.Length) {
		badRequest(w, "length: unknown round length")
		return
	}
	if !s.validVariant(l, req.List, req.Variant) || req.Level != 0 {
		badRequest(w, "list or variant: not offered (or a level, which Freetype has not)")
		return
	}
	var consistency *float64
	if v, ok := engine.Consistency(req.PerSecond, s.cfg.ConsistencyMinSeconds); ok {
		consistency = &v
	}
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	err := s.store.AddFreeplaySession(user, l.Info.ID, storage.FreetypeMode(req.List, req.Variant), storage.Session{
		WPM: req.WPM, Accuracy: req.Accuracy, Chars: req.Chars, Consistency: consistency, FinishedAt: time.Now(),
		Keys:   req.Keys,
		Length: req.Length,
		Device: req.Device,
		Round:  req.Round,
	})
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"consistency": consistency})
}

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
	variant := r.URL.Query().Get("variant")
	if storage.Listless(variant) {
		list = 0
	}
	if !s.validVariant(l, list, variant) {
		badRequest(w, "variant: unknown")
		return
	}
	out, err := s.history(user, l.Info.ID, storage.FreetypeMode(list, variant), length)
	if err != nil {
		serverError(w, err)
		return
	}
	out["lists"], out["list"], out["variant"], out["sentences"] = lists, list, variant, l.Sentences != nil
	writeJSON(w, http.StatusOK, out)
}
