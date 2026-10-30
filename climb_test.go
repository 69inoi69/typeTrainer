package main

// Climb through the whole app.

import (
	"fmt"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestApp_Climb(t *testing.T) {
	h, _, _ := newApp()
	place := func(st map[string]any) map[string]any { return st["place"].(map[string]any) }
	_, st := call(t, h, "GET", "/api/v1/freeplay/stats?lang=en", "")
	if place(st)["level"] != float64(1) || st["sessionCount"] != float64(0) || len(st["levels"].([]any)) != 10 {
		t.Fatalf("new user: %v", st)
	}
	code, out := call(t, h, "POST", "/api/v1/freeplay/portion?lang=en", `{"start":true,"words":50}`)
	if code != 200 || len(out["portions"].([]any)) != 9 || out["level"] != float64(1) {
		t.Fatalf("first portions: %d %v", code, out)
	}
	for range 20 {
		_, low := call(t, h, "POST", "/api/v1/freeplay/portion?lang=en", `{"level":1,"start":true}`)
		for _, p := range low["portions"].([]any) {
			for _, w := range p.(map[string]any)["words"].([]any) {
				if len([]rune(w.(string))) < 2 {
					t.Fatalf("a one-letter word in Climb: %q", w)
				}
			}
		}
	}
	list, _ := os.ReadFile("data/langs/en/words.txt")
	short := map[string]bool{}
	for _, w := range strings.Fields(string(list)) {
		short[w] = true
	}
	beyond := 0
	for range 5 {
		_, top := call(t, h, "POST", "/api/v1/freeplay/portion?lang=en", `{"level":10}`)
		if top["level"] != float64(10) {
			t.Fatalf("a picked level must be kept: %v", top["level"])
		}
		for _, p := range top["portions"].([]any) {
			for _, w := range p.(map[string]any)["words"].([]any) {
				if w != strings.ToLower(w.(string)) || strings.ContainsAny(w.(string), ",.") {
					t.Fatalf("Climb is words only: %q", w)
				}
				if !short[w.(string)] {
					beyond++
				}
			}
		}
	}
	if beyond < 20 {
		t.Fatalf("level 10 drew only %d of 30 words past words.txt", beyond)
	}
	for _, bad := range []string{`{"level":11}`, `{"level":-1}`, `{"start":true,"words":61}`, `{"start":true,"words":-1}`} {
		if code, _ := call(t, h, "POST", "/api/v1/freeplay/portion?lang=en", bad); code != 400 {
			t.Fatalf("%s must be rejected", bad)
		}
	}
	result := func(level int, acc float64) map[string]any {
		round := fmt.Sprintf(`{"wpm":55,"accuracy":%v,"chars":150,"perSecond":[5,5,5,5,5,5,5,5],"level":%d,
			"keys":[{"char":"T","errors":0,"ms":200},{"char":",","errors":0,"ms":180}]}`, acc, level)
		code, out := call(t, h, "POST", "/api/v1/freeplay/results?lang=en", round)
		if code != 200 || out["consistency"] == nil {
			t.Fatalf("results: %d %v", code, out)
		}
		return out
	}
	if out := result(4, 99); out["verdict"] != "pass" || out["place"].(map[string]any)["passes"] != float64(1) {
		t.Fatalf("first pass: %v", out)
	}
	result(4, 97)
	if p := result(4, 98)["place"].(map[string]any); p["level"] != float64(5) || p["moved"] != float64(1) {
		t.Fatalf("three passes: %v", p)
	}
	if out := result(5, 90); out["verdict"] != "fail" || out["place"].(map[string]any)["level"] != float64(5) {
		t.Fatalf("one fail: %v", out)
	}
	if p := result(5, 80)["place"].(map[string]any); p["level"] != float64(4) || p["moved"] != float64(-1) {
		t.Fatalf("two fails: %v", p)
	}
	for _, bad := range []string{`"level":1.5`, `"level":0`, `"level":11`} {
		if code, _ := call(t, h, "POST", "/api/v1/freeplay/results?lang=en", `{"wpm":55,"accuracy":99,"chars":10,`+bad+`}`); code != 400 {
			t.Fatalf("a result with %s must be rejected", bad)
		}
	}
	_, st = call(t, h, "GET", "/api/v1/freeplay/stats?lang=en", "")
	_, learn := call(t, h, "GET", "/api/v1/stats?lang=en", "")
	if st["sessionCount"] != float64(5) || learn["sessionCount"] != float64(0) || place(st)["level"] != float64(4) {
		t.Fatalf("histories: climb %v (%v), learning %v", st["sessionCount"], st["place"], learn["sessionCount"])
	}
	if _, next := call(t, h, "POST", "/api/v1/freeplay/portion?lang=en", `{"start":true}`); next["level"] != float64(4) {
		t.Fatalf("the next round must start where the user stands: %v", next["level"])
	}
	for _, k := range learn["keys"].([]any) {
		if k.(map[string]any)["count"] != float64(0) {
			t.Fatalf("Climb changed the letter statistics: %v", k)
		}
	}
	if _, pl := call(t, h, "GET", "/api/v1/freeplay/stats?lang=pl", ""); pl["sessionCount"] != float64(0) {
		t.Fatal("the history of one language leaked into another")
	}

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, guestRequest("GET", "/api/v1/export?lang=en", ""))
	file := rec.Body.String()
	if !strings.Contains(file, `"climbLevels":10`) {
		t.Fatal("the export must say its Climb levels are the ten")
	}
	call(t, h, "POST", "/api/v1/reset?lang=en", "")
	if _, st := call(t, h, "GET", "/api/v1/freeplay/stats?lang=en", ""); st["sessionCount"] != float64(0) || place(st)["level"] != float64(1) {
		t.Fatalf("reset did not clear Climb: %v", st)
	}
	if code, out := call(t, h, "POST", "/api/v1/import?lang=en", file); code != 200 {
		t.Fatalf("import: %d %v", code, out)
	}
	if _, st := call(t, h, "GET", "/api/v1/freeplay/stats?lang=en", ""); st["sessionCount"] != float64(5) || place(st)["level"] != float64(4) {
		t.Fatalf("import lost Climb: %v", st)
	}
	old := `{"unlocked":6,"keys":{},"sessions":[],"freeplay":{"testPassed":true,"sessions":[
		{"wpm":50,"accuracy":95,"chars":100,"finishedAt":"2026-10-19T10:00:00Z","level":0.64}]}}`
	if code, out := call(t, h, "POST", "/api/v1/import?lang=en", old); code != 200 {
		t.Fatalf("old file: %d %v", code, out)
	}
	if _, st := call(t, h, "GET", "/api/v1/freeplay/stats?lang=en", ""); place(st)["level"] != float64(7) {
		t.Fatalf("old level 64 must become 7: %v", st["place"])
	}
	bad := strings.Replace(file, `"level":4`, `"level":0.5`, 1)
	if code, _ := call(t, h, "POST", "/api/v1/import?lang=en", bad); code != 400 {
		t.Fatal("a ten-level file with level 0.5 must be rejected")
	}
}

func TestApp_ClimbWeakPairs(t *testing.T) {
	h, _, _ := newApp()
	text := strings.Repeat("the quick brown fox jumps ", 20)
	var keys []string
	for i, r := range text {
		ms := 150
		if i > 0 && text[i-1:i+1] == "ck" {
			ms = 450
		}
		keys = append(keys, fmt.Sprintf(`{"char":%q,"errors":0,"ms":%d}`, string(r), ms))
	}
	round := fmt.Sprintf(`{"wpm":60,"accuracy":100,"chars":%d,"level":5,"keys":[%s]}`, len(keys), strings.Join(keys, ","))
	code, out := call(t, h, "POST", "/api/v1/freeplay/results?lang=en", round)
	weak, _ := out["weak"].([]any)
	if code != 200 || len(weak) == 0 || weak[0].(map[string]any)["pair"] != "ck" {
		t.Fatalf("results: %d %v", code, out)
	}
	with, all := 0, 0
	for range 10 {
		_, next := call(t, h, "POST", "/api/v1/freeplay/portion?lang=en", `{"start":true}`)
		for _, p := range next["portions"].([]any) {
			for _, w := range p.(map[string]any)["words"].([]any) {
				all++
				if strings.Contains(strings.ToLower(w.(string)), "ck") {
					with++
				}
			}
		}
	}
	if share := float64(with) / float64(all); share < 0.3 {
		t.Fatalf("words with the weak pair: %d of %d", with, all)
	}
	h2, _, _ := newApp()
	if _, out := call(t, h2, "POST", "/api/v1/freeplay/results?lang=en", `{"wpm":55,"accuracy":99,"chars":10,"level":5}`); len(out["weak"].([]any)) != 0 {
		t.Fatalf("no history, still weak pairs: %v", out["weak"])
	}
}
