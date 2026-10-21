package main

// These tests run the whole app (real data files, real handlers, memory
// store) through HTTP requests, without starting a server.

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"slices"
	"strings"
	"testing"
)

// The app tests always use the memory store, even on a machine where
// DATABASE_URL is set: they must never write into a real database.
func TestMain(m *testing.M) {
	os.Unsetenv("DATABASE_URL")
	os.Exit(m.Run())
}

// testGuest is the guest cookie of the browser most tests play: like a real
// browser, it sends the same cookie with every request.
const testGuest = "test-browser"

// guestRequest is a request from that browser.
func guestRequest(method, path, body string) *http.Request {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.AddCookie(&http.Cookie{Name: "tt_guest", Value: testGuest})
	return req
}

// call sends one request from the test browser and returns the status and
// the JSON answer as a map.
func call(t *testing.T, h http.Handler, method, path, body string) (int, map[string]any) {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, guestRequest(method, path, body))
	var out map[string]any
	json.Unmarshal(rec.Body.Bytes(), &out)
	return rec.Code, out
}

// Every language in data/languages.json loads, builds a first round and
// serves its layout, the hidden ones too; /languages lists only the shown ones.
func TestApp_AllLanguagesLoad(t *testing.T) {
	h, _, err := newApp()
	if err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/v1/languages", nil))
	var langs []map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &langs); err != nil || len(langs) != 1 || langs[0]["id"] != "en" {
		t.Fatalf("languages: %s", rec.Body.String())
	}
	for _, id := range []string{"en", "pl", "uk", "ru"} {
		code, out := call(t, h, "POST", "/api/v1/portion?lang="+id, `{"start":true}`)
		if code != 200 || len(out["portions"].([]any)) != 3 { // AheadPortions = 2, plus the one to type
			t.Fatalf("%s: portion %d %v", id, code, out)
		}
		code, _ = call(t, h, "GET", "/api/v1/layout?lang="+id, "")
		if code != 200 {
			t.Fatalf("%s: layout %d", id, code)
		}
	}
}

// An unknown ?lang= is refused instead of falling back to the default.
func TestApp_UnknownLanguageIs400(t *testing.T) {
	h, _, _ := newApp()
	if code, _ := call(t, h, "POST", "/api/v1/portion?lang=xx", "{}"); code != 400 {
		t.Fatalf("got %d, want 400", code)
	}
}

// A round counts only in its own language, and letters of another alphabet
// are refused.
func TestApp_ResultsAreKeptPerLanguage(t *testing.T) {
	h, _, _ := newApp()
	body := `{"samples":[{"char":"ж","errors":0,"ms":300},{"char":" ","errors":0,"ms":200}],"wpm":30,"accuracy":100}`
	if code, out := call(t, h, "POST", "/api/v1/results?lang=ru", body); code != 200 {
		t.Fatalf("ru results: %d %v", code, out)
	}
	_, ru := call(t, h, "GET", "/api/v1/stats?lang=ru", "")
	_, uk := call(t, h, "GET", "/api/v1/stats?lang=uk", "")
	if ru["sessionCount"].(float64) != 1 || uk["sessionCount"].(float64) != 0 {
		t.Fatalf("ru=%v uk=%v", ru["sessionCount"], uk["sessionCount"])
	}
	// a Latin letter is not part of the Russian alphabet
	bad := `{"samples":[{"char":"a","errors":0,"ms":300}],"wpm":30,"accuracy":100}`
	if code, _ := call(t, h, "POST", "/api/v1/results?lang=ru", bad); code != 400 {
		t.Fatalf("latin letter in ru: got %d, want 400", code)
	}
}

// Reset clears one language (history and open letters) and leaves the others.
func TestApp_ResetClearsOneLanguage(t *testing.T) {
	h, _, _ := newApp()
	body := `{"samples":[{"char":"ж","errors":0,"ms":300},{"char":" ","errors":0,"ms":200}],"wpm":30,"accuracy":100}`
	call(t, h, "POST", "/api/v1/results?lang=ru", body)
	call(t, h, "POST", "/api/v1/results?lang=uk", body)
	call(t, h, "POST", "/api/v1/progress?lang=ru", `{"unlockAll":true}`)
	if code, out := call(t, h, "POST", "/api/v1/reset?lang=ru", ""); code != 200 {
		t.Fatalf("reset: %d %v", code, out)
	}
	_, ru := call(t, h, "GET", "/api/v1/stats?lang=ru", "")
	_, uk := call(t, h, "GET", "/api/v1/stats?lang=uk", "")
	if ru["sessionCount"].(float64) != 0 || uk["sessionCount"].(float64) != 1 {
		t.Fatalf("after reset ru=%v uk=%v", ru["sessionCount"], uk["sessionCount"])
	}
	// back to the first lesson, not all letters
	_, out := call(t, h, "POST", "/api/v1/portion?lang=ru", "{}")
	if len(out["portions"].([]any)[0].(map[string]any)["locked"].([]any)) == 0 {
		t.Fatal("after reset all letters are still open")
	}
}

// The stream: samples sent with a portion update the statistics at once,
// the answer has the next portion, and nothing goes into the history until
// the run is stopped with /results.
func TestApp_PortionLearnsWithoutAHistoryEntry(t *testing.T) {
	h, _, _ := newApp()
	body := `{"samples":[{"char":"о","errors":1,"ms":300},{"char":" ","errors":0,"ms":200}],"recent":["он"],"retry":["он"]}`
	code, out := call(t, h, "POST", "/api/v1/portion?lang=ru", body)
	if code != 200 {
		t.Fatalf("portion: %d %v", code, out)
	}
	por := out["portions"].([]any)[0].(map[string]any)
	if len(por["words"].([]any)) == 0 || por["focus"] == "" || len(out["portions"].([]any)) != 1 {
		t.Fatalf("portion: %v", out)
	}
	_, st := call(t, h, "GET", "/api/v1/stats?lang=ru", "")
	if st["sessionCount"].(float64) != 0 {
		t.Fatal("a portion must not add a history entry")
	}
	counted := false
	for _, k := range st["keys"].([]any) {
		if k := k.(map[string]any); k["char"] == "о" && k["count"].(float64) == 1 {
			counted = true
		}
	}
	if !counted {
		t.Fatal("the sample of о was not applied")
	}
	// stopping with nothing left to send still records the run
	if code, out := call(t, h, "POST", "/api/v1/results?lang=ru", `{"samples":[],"chars":40,"wpm":30,"accuracy":95}`); code != 200 {
		t.Fatalf("results: %d %v", code, out)
	}
	_, st = call(t, h, "GET", "/api/v1/stats?lang=ru", "")
	if st["sessionCount"].(float64) != 1 {
		t.Fatal("results must add one history entry")
	}
	_, out = call(t, h, "POST", "/api/v1/portion?lang=ru", `{"last":true}`)
	if len(out["portions"].([]any)) != 0 {
		t.Fatalf("last: want no portions, got %v", out)
	}
	for _, bad := range []string{`{"start":"yes"}`, `{"samples":[{"char":"a","errors":0,"ms":1}]}`} {
		if code, _ := call(t, h, "POST", "/api/v1/portion?lang=ru", bad); code != 400 {
			t.Fatalf("%s: got %d, want 400", bad, code)
		}
	}
	if code, _ := call(t, h, "POST", "/api/v1/results?lang=ru", `{"samples":[],"wpm":30,"accuracy":95}`); code != 400 {
		t.Fatal("a run with nothing typed must be rejected")
	}
}

// Export -> reset -> import must give back exactly the same data, and the
// sessions must come out oldest first.
func TestApp_ExportImportRoundTrip(t *testing.T) {
	h, _, _ := newApp()
	for _, wpm := range []string{"20", "40"} {
		body := `{"samples":[{"char":"ж","errors":1,"ms":300},{"char":" ","errors":0,"ms":200}],"wpm":` + wpm + `,"accuracy":90}`
		call(t, h, "POST", "/api/v1/results?lang=ru", body)
	}
	call(t, h, "POST", "/api/v1/progress?lang=ru", `{"unlockAll":true}`)

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, guestRequest("GET", "/api/v1/export?lang=ru", ""))
	exported := rec.Body.String()
	var file struct {
		Unlocked int
		Keys     map[string]map[string]any
		Sessions []struct{ WPM float64 }
	}
	if err := json.Unmarshal([]byte(exported), &file); err != nil {
		t.Fatal(err)
	}
	if len(file.Sessions) != 2 || file.Sessions[0].WPM != 20 || file.Sessions[1].WPM != 40 {
		t.Fatalf("sessions must be oldest first: %+v", file.Sessions)
	}
	if file.Keys["ж"]["count"].(float64) != 2 || file.Unlocked == 0 {
		t.Fatalf("export lost data: %s", exported)
	}

	call(t, h, "POST", "/api/v1/reset?lang=ru", "")
	if code, out := call(t, h, "POST", "/api/v1/import?lang=ru", exported); code != 200 {
		t.Fatalf("import: %d %v", code, out)
	}
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, guestRequest("GET", "/api/v1/export?lang=ru", ""))
	if rec.Body.String() != exported {
		t.Fatalf("round trip changed the data:\n%s\n%s", exported, rec.Body.String())
	}
}

// A language that was never used exports as an empty record and imports back.
func TestApp_ExportOfEmptyLanguage(t *testing.T) {
	h, _, _ := newApp()
	code, out := call(t, h, "GET", "/api/v1/export?lang=pl", "")
	if code != 200 || out["unlocked"].(float64) != 0 || len(out["sessions"].([]any)) != 0 || len(out["keys"].(map[string]any)) != 0 {
		t.Fatalf("empty export: %d %v", code, out)
	}
	if code, _ := call(t, h, "POST", "/api/v1/import?lang=pl", `{}`); code != 200 {
		t.Fatalf("importing an empty record: %d", code)
	}
}

// A bad file is refused AND changes nothing.
func TestApp_ImportRejectsBadDataAndKeepsOldData(t *testing.T) {
	h, _, _ := newApp()
	call(t, h, "POST", "/api/v1/results?lang=en", `{"samples":[{"char":"a","errors":0,"ms":300}],"wpm":30,"accuracy":100}`)
	bad := []string{
		`not json`,
		`{"unlocked":-1}`,
		`{"unlocked":9999}`,
		`{"keys":{"ж":{"count":1}}}`,                                // not an English letter
		`{"keys":{"ab":{"count":1}}}`,                               // not one character
		`{"keys":{"a":{"count":1,"mistakes":2}}}`,                   // more mistakes than presses
		`{"keys":{"a":{"count":1,"errEma":1.5}}}`,                   // probability above 1
		`{"keys":{"a":{"count":-1}}}`,                               // negative count
		`{"sessions":[{"wpm":999,"accuracy":50}]}`,                  // impossible speed
		`{"sessions":[{"wpm":30,"accuracy":150}]}`,                  // impossible accuracy
		`{"sessions":[{"wpm":30,"accuracy":90,"consistency":101}]}`, // impossible consistency
		`{"sessions":[{"wpm":30,"accuracy":90,"unlocked":9999}]}`,   // more letters than exist
		`{"sessions":[{"wpm":30,"accuracy":90,"keys":[{"char":"ж","errors":0,"ms":300}]}]}`, // raw key not English
	}
	for _, b := range bad {
		if code, _ := call(t, h, "POST", "/api/v1/import?lang=en", b); code != 400 {
			t.Errorf("%s: want 400, got %d", b, code)
		}
	}
	_, st := call(t, h, "GET", "/api/v1/stats?lang=en", "")
	if st["sessionCount"].(float64) != 1 {
		t.Fatalf("a refused import changed the data: %v", st["sessionCount"])
	}
}

// /results measures consistency from the keypresses per second, keeps it in
// the history and answers with it; a round too short to judge gets null.
func TestApp_ResultsConsistency(t *testing.T) {
	h, _, _ := newApp()
	code, out := call(t, h, "POST", "/api/v1/results?lang=en", `{"samples":[],"chars":30,"wpm":30,"accuracy":95,"perSecond":[5,5,5,5,5,5]}`)
	if code != 200 || out["consistency"] != 100.0 {
		t.Fatalf("even pace: %d %v, want consistency 100", code, out)
	}
	_, st := call(t, h, "GET", "/api/v1/stats?lang=en", "")
	if c := st["sessions"].([]any)[0].(map[string]any)["consistency"]; c != 100.0 {
		t.Fatalf("history: consistency %v, want 100", c)
	}
	_, out = call(t, h, "POST", "/api/v1/results?lang=en", `{"samples":[],"chars":10,"wpm":30,"accuracy":95,"perSecond":[5,5]}`)
	if c, there := out["consistency"]; !there || c != nil {
		t.Fatalf("short round: consistency %v, want null", c)
	}
	_, st = call(t, h, "GET", "/api/v1/stats?lang=en", "")
	if _, there := st["sessions"].([]any)[0].(map[string]any)["consistency"]; there {
		t.Fatal("short round: the history entry must have no consistency")
	}
	if code, _ := call(t, h, "POST", "/api/v1/results?lang=en", `{"samples":[],"chars":10,"wpm":30,"accuracy":95,"perSecond":[5,-1,5,5,5]}`); code != 400 {
		t.Fatal("a negative count per second must be rejected")
	}
}

// Climb, the second mode: open to everyone; a round is typed at one level
// (the user's, LevelStart at first, or one they pick); three passes take
// them up, two fails in a row down; words only; its rounds go to their own
// history with their level and never change the letter statistics of
// learning; export/import carry it (and turn the old 0..1 levels into the
// ten), reset clears it.
func TestApp_Climb(t *testing.T) {
	h, _, _ := newApp()
	place := func(st map[string]any) map[string]any { return st["place"].(map[string]any) }
	_, st := call(t, h, "GET", "/api/v1/freeplay/stats?lang=en", "")
	if place(st)["level"] != float64(1) || st["sessionCount"] != float64(0) || len(st["levels"].([]any)) != 10 {
		t.Fatalf("new user: %v", st)
	}
	code, out := call(t, h, "POST", "/api/v1/freeplay/portion?lang=en", `{"start":true}`)
	if code != 200 || len(out["portions"].([]any)) != 3 || out["round"] != float64(5) || out["level"] != float64(1) {
		t.Fatalf("first portions: %d %v", code, out)
	}
	// no one-letter words ("a", "i"), even among the 200 most common
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
	// the top level draws from the long list (free.txt), past words.txt;
	// words only, in lower case
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
	if beyond < 20 { // 30 words at level 10: almost all are past the 2000 of words.txt
		t.Fatalf("level 10 drew only %d of 30 words past words.txt", beyond)
	}
	for _, bad := range []string{`{"level":11}`, `{"level":-1}`} {
		if code, _ := call(t, h, "POST", "/api/v1/freeplay/portion?lang=en", bad); code != 400 {
			t.Fatalf("%s must be rejected", bad)
		}
	}
	// three passes at level 4: up to 5; the answer says where the round
	// leaves the user. Capitals and punctuation are still fine in the raw
	// record (rounds from before the ten levels).
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
	// two fails in a row at 5: back to 4
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

	// export -> reset -> import brings the history and the level back
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
	// a file from before the ten levels (no climbLevels, level 0..1, here
	// the old 64 -> 7), with the typing test's flag of the free practice
	// days: still loads, the level turned into a new one
	old := `{"unlocked":6,"keys":{},"sessions":[],"freeplay":{"testPassed":true,"sessions":[
		{"wpm":50,"accuracy":95,"chars":100,"finishedAt":"2026-10-19T10:00:00Z","level":0.64}]}}`
	if code, out := call(t, h, "POST", "/api/v1/import?lang=en", old); code != 200 {
		t.Fatalf("old file: %d %v", code, out)
	}
	if _, st := call(t, h, "GET", "/api/v1/freeplay/stats?lang=en", ""); place(st)["level"] != float64(7) {
		t.Fatalf("old level 64 must become 7: %v", st["place"])
	}
	// a new file with a level out of 1..10 is refused
	bad := strings.Replace(file, `"level":4`, `"level":0.5`, 1)
	if code, _ := call(t, h, "POST", "/api/v1/import?lang=en", bad); code != 400 {
		t.Fatal("a ten-level file with level 0.5 must be rejected")
	}
}

// Climb's weak pairs: a round with a slow "ck" makes "ck" the first weak
// pair in the result, and the next words carry it far more often than the
// plain draw would.
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
	// the plain draw at level 5 has "ck" in about 1 word of 100
	if share := float64(with) / float64(all); share < 0.3 {
		t.Fatalf("words with the weak pair: %d of %d", with, all)
	}
	// a new user has no history: no weak pairs
	h2, _, _ := newApp()
	if _, out := call(t, h2, "POST", "/api/v1/freeplay/results?lang=en", `{"wpm":55,"accuracy":99,"chars":10,"level":5}`); len(out["weak"].([]any)) != 0 {
		t.Fatalf("no history, still weak pairs: %v", out["weak"])
	}
}

// Freetype, the third mode: words from the list the typist chose (the n
// most common of free.txt), lower case, no level; every list has its own
// history, apart from Climb and learning; export/import carry them.
func TestApp_Freetype(t *testing.T) {
	h, _, _ := newApp()
	_, st := call(t, h, "GET", "/api/v1/freetype/stats?lang=en", "")
	lists := fmt.Sprint(st["lists"])
	if lists != "[200 1000 5000 10000 25000]" || st["list"] != float64(200) || st["sessionCount"] != float64(0) {
		t.Fatalf("new user: lists %v, list %v, rounds %v", lists, st["list"], st["sessionCount"])
	}
	// a hidden language without free.txt offers what its words.txt allows
	if _, ru := call(t, h, "GET", "/api/v1/freetype/stats?lang=ru", ""); fmt.Sprint(ru["lists"]) != "[200 1000]" {
		t.Fatalf("ru lists: %v", ru["lists"])
	}
	code, out := call(t, h, "POST", "/api/v1/freetype/portion?lang=en", `{"start":true,"list":200}`)
	if code != 200 || len(out["portions"].([]any)) != 3 || out["level"] != nil {
		t.Fatalf("first portions: %d %v", code, out)
	}
	for _, p := range out["portions"].([]any) {
		for _, w := range p.(map[string]any)["words"].([]any) {
			if w != strings.ToLower(w.(string)) || strings.ContainsAny(w.(string), ",.") {
				t.Fatalf("Freetype words are plain: %q", w)
			}
		}
	}
	for _, bad := range []string{`{"start":true,"list":300}`, `{"start":true}`} {
		if code, _ := call(t, h, "POST", "/api/v1/freetype/portion?lang=en", bad); code != 400 {
			t.Fatalf("%s: a list not offered must be rejected", bad)
		}
	}
	round := func(list int, wpm float64) int {
		code, _ := call(t, h, "POST", "/api/v1/freetype/results?lang=en", fmt.Sprintf(
			`{"wpm":%v,"accuracy":98,"chars":150,"perSecond":[5,5,5,5,5,5],"list":%d,"keys":[{"char":"t","errors":0,"ms":200}]}`, wpm, list))
		return code
	}
	if round(1000, 80) != 200 || round(1000, 85) != 200 || round(25000, 60) != 200 {
		t.Fatal("results not stored")
	}
	if code := round(300, 80); code != 400 {
		t.Fatal("a result on a list not offered must be rejected")
	}
	if code, _ := call(t, h, "POST", "/api/v1/freetype/results?lang=en", `{"wpm":50,"accuracy":98,"chars":10,"list":200,"keys":[{"char":"ж","errors":0,"ms":200}]}`); code != 400 {
		t.Fatal("a letter of another alphabet is not a Freetype letter")
	}

	// the variants: long words of a list, real sentences and your own text (no list)
	code, out = call(t, h, "POST", "/api/v1/freetype/portion?lang=en", `{"start":true,"list":1000,"variant":"long"}`)
	if code != 200 {
		t.Fatalf("long portions: %d %v", code, out)
	}
	for _, w := range out["portions"].([]any)[0].(map[string]any)["words"].([]any) {
		if len(w.(string)) < 6 {
			t.Fatalf("a round of long words has %q", w)
		}
	}
	code, out = call(t, h, "POST", "/api/v1/freetype/portion?lang=en", `{"start":true,"variant":"sentences"}`)
	if code != 200 {
		t.Fatalf("sentence portions: %d %v", code, out)
	}
	words := out["portions"].([]any)[0].(map[string]any)["words"].([]any)
	if first := words[0].(string); first[:1] != strings.ToUpper(first[:1]) || !strings.ContainsAny(words[len(words)-1].(string), ".?!") {
		t.Fatalf("a portion of sentences: %v", words)
	}
	for _, bad := range []string{`{"list":1000,"variant":"custom"}`, `{"list":1000,"variant":"punct"}`, `{"list":1000,"variant":"sentences"}`, `{"variant":"long"}`} {
		if code, _ := call(t, h, "POST", "/api/v1/freetype/portion?lang=en", bad); code != 400 {
			t.Fatalf("%s: your own text, unknown variants and a list where none belongs have no portions", bad)
		}
	}
	if _, ru := call(t, h, "GET", "/api/v1/freetype/stats?lang=ru", ""); ru["sentences"] != false {
		t.Fatalf("ru has no sentences.txt: %v", ru["sentences"])
	}
	variant := func(list int, v string) int {
		code, _ := call(t, h, "POST", "/api/v1/freetype/results?lang=en", fmt.Sprintf(
			`{"wpm":70,"accuracy":97,"chars":20,"list":%d,"variant":%q,"keys":[{"char":"T","errors":0,"ms":200},{"char":"?","errors":0,"ms":200}]}`, list, v))
		return code
	}
	if variant(0, "sentences") != 200 || variant(0, "custom") != 200 || variant(1000, "custom") != 400 || variant(0, "long") != 400 {
		t.Fatal("variant results: sentences and custom need no list, long one")
	}
	_, pv := call(t, h, "GET", "/api/v1/freetype/stats?lang=en&variant=sentences", "")
	_, cv := call(t, h, "GET", "/api/v1/freetype/stats?lang=en&variant=custom", "")
	if pv["sessionCount"] != float64(1) || cv["sessionCount"] != float64(1) || cv["variant"] != "custom" {
		t.Fatalf("variant histories: sentences %v, custom %v", pv["sessionCount"], cv)
	}
	_, k := call(t, h, "GET", "/api/v1/freetype/stats?lang=en&list=1000", "")
	_, big := call(t, h, "GET", "/api/v1/freetype/stats?lang=en&list=25000", "")
	_, climb := call(t, h, "GET", "/api/v1/freeplay/stats?lang=en", "")
	_, learn := call(t, h, "GET", "/api/v1/stats?lang=en", "")
	if k["sessionCount"] != float64(2) || big["sessionCount"] != float64(1) || climb["sessionCount"] != float64(0) || learn["sessionCount"] != float64(0) {
		t.Fatalf("histories: 1k %v, 25k %v, climb %v, learning %v", k["sessionCount"], big["sessionCount"], climb["sessionCount"], learn["sessionCount"])
	}
	if code, _ := call(t, h, "GET", "/api/v1/freetype/stats?lang=en&list=7", ""); code != 400 {
		t.Fatal("stats of a list not offered must be rejected")
	}

	// export -> reset -> import brings every list back
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, guestRequest("GET", "/api/v1/export?lang=en", ""))
	file := rec.Body.String()
	if !strings.Contains(file, `"freetype":{"1000":`) || !strings.Contains(file, `"custom":`) || !strings.Contains(file, `"sentences":`) {
		t.Fatalf("export lacks Freetype: %.300s", file)
	}
	call(t, h, "POST", "/api/v1/reset?lang=en", "")
	if code, out := call(t, h, "POST", "/api/v1/import?lang=en", file); code != 200 {
		t.Fatalf("import: %d %v", code, out)
	}
	if _, k := call(t, h, "GET", "/api/v1/freetype/stats?lang=en&list=1000", ""); k["sessionCount"] != float64(2) {
		t.Fatalf("import lost Freetype: %v", k["sessionCount"])
	}
	if _, cv := call(t, h, "GET", "/api/v1/freetype/stats?lang=en&variant=custom", ""); cv["sessionCount"] != float64(1) {
		t.Fatalf("import lost your own text: %v", cv["sessionCount"])
	}
	bad := strings.Replace(file, `"freetype":{"1000":`, `"freetype":{"999":`, 1)
	if code, _ := call(t, h, "POST", "/api/v1/import?lang=en", bad); code != 400 {
		t.Fatal("an import with an unknown list must be rejected")
	}
}

// /results keeps every keypress of the round as its raw record, but the
// model learns only from "samples": a key sent with /portion and again in
// "keys" is counted once. The stats page gets the numbers only; the raw
// keys come with /export and survive an import.
func TestApp_RawKeysKept(t *testing.T) {
	h, _, _ := newApp()
	// "ж" was learned with /portion; /results sends the rest
	call(t, h, "POST", "/api/v1/portion?lang=ru", `{"samples":[{"char":"ж","errors":1,"ms":300}],"last":true}`)
	body := `{"samples":[{"char":" ","errors":0,"ms":200}],` +
		`"keys":[{"char":"ж","errors":1,"ms":300},{"char":" ","errors":0,"ms":200}],"wpm":30,"accuracy":50}`
	if code, out := call(t, h, "POST", "/api/v1/results?lang=ru", body); code != 200 {
		t.Fatalf("results: %d %v", code, out)
	}

	_, exp := call(t, h, "GET", "/api/v1/export?lang=ru", "")
	sess := exp["sessions"].([]any)[0].(map[string]any)
	keys, _ := sess["keys"].([]any)
	if len(keys) != 2 || keys[0].(map[string]any)["char"] != "ж" || sess["unlocked"].(float64) == 0 {
		t.Fatalf("raw record not kept: %v", sess)
	}
	if n := exp["keys"].(map[string]any)["ж"].(map[string]any)["count"].(float64); n != 1 {
		t.Fatalf("ж learned %v times, want 1 (keys must not be learned again)", n)
	}

	_, st := call(t, h, "GET", "/api/v1/stats?lang=ru", "")
	if _, has := st["sessions"].([]any)[0].(map[string]any)["keys"]; has {
		t.Fatal("/stats must not send raw keys")
	}

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, guestRequest("GET", "/api/v1/export?lang=ru", ""))
	exported := rec.Body.String()
	call(t, h, "POST", "/api/v1/reset?lang=ru", "")
	call(t, h, "POST", "/api/v1/import?lang=ru", exported)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, guestRequest("GET", "/api/v1/export?lang=ru", ""))
	if rec.Body.String() != exported {
		t.Fatal("raw keys lost in an export/import round trip")
	}

	// free practice keeps its raw keys too, without touching the letters
	call(t, h, "POST", "/api/v1/progress?lang=ru", `{"unlockAll":true}`)
	free := `{"keys":[{"char":"ж","errors":0,"ms":250}],"chars":1,"wpm":60,"accuracy":100,"level":1}`
	if code, out := call(t, h, "POST", "/api/v1/freeplay/results?lang=ru", free); code != 200 {
		t.Fatalf("freeplay results: %d %v", code, out)
	}
	_, exp = call(t, h, "GET", "/api/v1/export?lang=ru", "")
	fs := exp["freeplay"].(map[string]any)["sessions"].([]any)[0].(map[string]any)
	if k, _ := fs["keys"].([]any); len(k) != 1 {
		t.Fatalf("freeplay raw keys not kept: %v", fs)
	}
	if n := exp["keys"].(map[string]any)["ж"].(map[string]any)["count"].(float64); n != 1 {
		t.Fatalf("free practice changed the letter model: ж count %v", n)
	}
	_, fst := call(t, h, "GET", "/api/v1/freeplay/stats?lang=ru", "")
	if _, has := fst["sessions"].([]any)[0].(map[string]any)["keys"]; has {
		t.Fatal("/freeplay/stats must not send raw keys")
	}
}

// callAs is call with a login cookie ("" = a guest); it also returns the
// login cookie the answer sets ("" if none).
func callAs(t *testing.T, h http.Handler, cookie, method, path, body string) (int, map[string]any, string) {
	t.Helper()
	req := guestRequest(method, path, body)
	if cookie != "" {
		req.AddCookie(&http.Cookie{Name: "tt_login", Value: cookie})
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var out map[string]any
	json.Unmarshal(rec.Body.Bytes(), &out)
	set := ""
	for _, c := range rec.Result().Cookies() {
		if c.Name == "tt_login" {
			set = c.Value
			if !c.HttpOnly || c.SameSite != http.SameSiteLaxMode {
				t.Fatalf("login cookie must be HttpOnly and SameSite=Lax: %+v", c)
			}
		}
	}
	return rec.Code, out, set
}

// Sign up, log in, log out, and every account (and the guest) has its own data.
func TestApp_Accounts(t *testing.T) {
	h, _, _ := newApp()
	_, me, _ := callAs(t, h, "", "GET", "/api/v1/auth/me", "")
	if me["accounts"] != true || me["name"] != nil {
		t.Fatalf("guest /me: %v", me)
	}

	code, out, ann := callAs(t, h, "", "POST", "/api/v1/auth/register", `{"name":" Ann ","password":"secret-ann"}`)
	if code != 200 || out["name"] != "ann" || ann == "" {
		t.Fatalf("register: %d %v cookie=%q", code, out, ann)
	}
	if _, me, _ := callAs(t, h, ann, "GET", "/api/v1/auth/me", ""); me["name"] != "ann" {
		t.Fatalf("ann /me: %v", me)
	}

	// the rules: name taken (any case), bad name, short password
	for body, want := range map[string]int{
		`{"name":"ANN","password":"another-pw"}`:  409,
		`{"name":"a","password":"secret-ann"}`:    400,
		`{"name":"анна","password":"secret-ann"}`: 400,
		`{"name":"bob","password":"short"}`:       400,
		`not json`:                                400,
	} {
		if code, _, _ := callAs(t, h, "", "POST", "/api/v1/auth/register", body); code != want {
			t.Errorf("register %s: %d, want %d", body, code, want)
		}
	}

	// a round typed by ann is ann's only: the guest still has nothing
	round := `{"samples":[{"char":"ж","errors":0,"ms":300}],"wpm":30,"accuracy":100}`
	if code, _, _ := callAs(t, h, ann, "POST", "/api/v1/results?lang=ru", round); code != 200 {
		t.Fatalf("ann's round: %d", code)
	}
	_, guest, _ := callAs(t, h, "", "GET", "/api/v1/stats?lang=ru", "")
	_, mine, _ := callAs(t, h, ann, "GET", "/api/v1/stats?lang=ru", "")
	if guest["sessionCount"].(float64) != 0 || mine["sessionCount"].(float64) != 1 {
		t.Fatalf("guest=%v ann=%v", guest["sessionCount"], mine["sessionCount"])
	}

	// wrong password and unknown name get the same answer
	for _, body := range []string{`{"name":"ann","password":"wrong-pass"}`, `{"name":"nobody","password":"secret-ann"}`} {
		if code, out, c := callAs(t, h, "", "POST", "/api/v1/auth/login", body); code != 401 || c != "" || out["error"] != "wrong name or password" {
			t.Errorf("login %s: %d %v", body, code, out)
		}
	}
	code, _, ann2 := callAs(t, h, "", "POST", "/api/v1/auth/login", `{"name":"Ann","password":"secret-ann"}`)
	if code != 200 || ann2 == "" || ann2 == ann {
		t.Fatalf("login: %d, a new cookie expected", code)
	}
	if _, again, _ := callAs(t, h, ann2, "GET", "/api/v1/stats?lang=ru", ""); again["sessionCount"].(float64) != 1 {
		t.Fatal("after logging in again ann's data is gone")
	}

	// logout ends that login only; an unknown cookie is just a guest
	callAs(t, h, ann, "POST", "/api/v1/auth/logout", "")
	if _, me, _ := callAs(t, h, ann, "GET", "/api/v1/auth/me", ""); me["name"] != nil {
		t.Fatalf("after logout: %v", me)
	}
	if _, me, _ := callAs(t, h, ann2, "GET", "/api/v1/auth/me", ""); me["name"] != "ann" {
		t.Fatal("logout ended the other login too")
	}
	if code, me, _ := callAs(t, h, "made-up", "GET", "/api/v1/auth/me", ""); code != 200 || me["name"] != nil {
		t.Fatalf("unknown cookie: %d %v", code, me)
	}
}

// cookieOf finds a cookie the answer sets (nil if none).
func cookieOf(rec *httptest.ResponseRecorder, name string) *http.Cookie {
	for _, c := range rec.Result().Cookies() {
		if c.Name == name {
			return c
		}
	}
	return nil
}

// Every browser gets its own guest: a request without a guest cookie gets
// one (already from the page itself), and two guests never share data.
func TestApp_GuestPerBrowser(t *testing.T) {
	h, _, _ := newApp()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/", nil))
	c := cookieOf(rec, "tt_guest")
	if c == nil || c.Value == "" || !c.HttpOnly || c.SameSite != http.SameSiteLaxMode || c.MaxAge <= 0 {
		t.Fatalf("the page must set a guest cookie: %+v", c)
	}
	if c.Secure {
		t.Fatal("plain HTTP without a proxy: the cookie cannot be Secure")
	}
	// a browser that already has one keeps it
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, guestRequest("GET", "/", ""))
	if cookieOf(rec, "tt_guest") != nil {
		t.Fatal("an existing guest cookie must not be replaced")
	}

	// the test browser's round is not seen by the new guest
	round := `{"samples":[{"char":"ж","errors":0,"ms":300}],"wpm":30,"accuracy":100}`
	call(t, h, "POST", "/api/v1/results?lang=ru", round)
	other := httptest.NewRequest("GET", "/api/v1/stats?lang=ru", nil)
	other.AddCookie(c)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, other)
	var theirs map[string]any
	json.Unmarshal(rec.Body.Bytes(), &theirs)
	_, mine := call(t, h, "GET", "/api/v1/stats?lang=ru", "")
	if theirs["sessionCount"].(float64) != 0 || mine["sessionCount"].(float64) != 1 {
		t.Fatalf("new guest=%v test browser=%v", theirs["sessionCount"], mine["sessionCount"])
	}
}

// fromIP is a guest request from one IP address.
func fromIP(t *testing.T, h http.Handler, ip, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := guestRequest("POST", path, body)
	req.RemoteAddr = ip + ":5000"
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

// After Auth.Attempts failed logins or sign-ups from one IP address, that
// address gets 429 (even with the right password); others do not.
func TestApp_LoginAttemptLimit(t *testing.T) {
	h, cfg, _ := newApp()
	if rec := fromIP(t, h, "10.0.0.1", "/api/v1/auth/register", `{"name":"ann","password":"secret-ann"}`); rec.Code != 200 {
		t.Fatalf("register: %d", rec.Code)
	}
	right := `{"name":"ann","password":"secret-ann"}`
	// two wrong passwords, the rest cheap broken sign-ups: all count
	for i := 0; i < cfg.Auth.Attempts; i++ {
		path, body := "/api/v1/auth/register", `{"name":"x","password":"short"}`
		if i < 2 {
			path, body = "/api/v1/auth/login", `{"name":"ann","password":"wrong-pass"}`
		}
		if rec := fromIP(t, h, "10.0.0.2", path, body); rec.Code == 429 {
			t.Fatalf("attempt %d refused too early", i+1)
		}
	}
	rec := fromIP(t, h, "10.0.0.2", "/api/v1/auth/login", right)
	if rec.Code != 429 || rec.Header().Get("Retry-After") == "" {
		t.Fatalf("over the limit: %d, Retry-After=%q", rec.Code, rec.Header().Get("Retry-After"))
	}
	if rec := fromIP(t, h, "10.0.0.3", "/api/v1/auth/login", right); rec.Code != 200 {
		t.Fatalf("another address must not be limited: %d", rec.Code)
	}
}

// Behind a proxy (BEHIND_PROXY=1) cookies are Secure when the proxy says
// HTTPS, and the limit counts the address the proxy added, not one the
// client wrote in front of it. Without the setting both headers are ignored.
func TestApp_BehindProxy(t *testing.T) {
	viaProxy := func(h http.Handler, forwardedFor string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("POST", "/api/v1/auth/register", strings.NewReader(`{"name":"x","password":"short"}`))
		req.Header.Set("X-Forwarded-Proto", "https")
		req.Header.Set("X-Forwarded-For", forwardedFor)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}

	h, _, _ := newApp()
	if c := cookieOf(viaProxy(h, "1.1.1.1"), "tt_guest"); c == nil || c.Secure {
		t.Fatalf("no BEHIND_PROXY: the header must be ignored: %+v", c)
	}

	t.Setenv("BEHIND_PROXY", "1")
	h, cfg, _ := newApp()
	if c := cookieOf(viaProxy(h, "1.1.1.1"), "tt_guest"); c == nil || !c.Secure {
		t.Fatalf("HTTPS through the proxy: the cookie must be Secure: %+v", c)
	}
	// a different made-up first address every time: still one client
	for i := 0; i < cfg.Auth.Attempts; i++ {
		viaProxy(h, "fake-"+strings.Repeat("x", i)+", 9.9.9.9")
	}
	if rec := viaProxy(h, "fake-new, 9.9.9.9"); rec.Code != 429 {
		t.Fatalf("faking X-Forwarded-For got around the limit: %d", rec.Code)
	}
	if rec := viaProxy(h, "8.8.8.8"); rec.Code == 429 {
		t.Fatal("another client must not be limited")
	}
}

// Round lengths (settings): each round keeps its length, the stats pages
// show one length at a time and list the lengths there are; a length the
// server does not know is a 400.
func TestApp_RoundLengths(t *testing.T) {
	h, _, _ := newApp()
	round := func(path, length string, wpm int) int {
		body := fmt.Sprintf(`{"chars":20,"wpm":%d,"accuracy":100,"length":%q}`, wpm, length)
		if strings.Contains(path, "freeplay") { // a Climb round has its level
			body = strings.Replace(body, "{", `{"level":3,`, 1)
		}
		code, _ := call(t, h, "POST", path, body)
		return code
	}
	for _, r := range []struct {
		length string
		wpm    int
	}{{"", 20}, {"words-10", 30}, {"time-60", 40}, {"time-60", 50}} {
		if code := round("/api/v1/results?lang=en", r.length, r.wpm); code != 200 {
			t.Fatalf("results %q: %d", r.length, code)
		}
	}
	for _, bad := range []string{"words-0", "time-9999", "minutes-5", "words-x", "words-010", "words"} {
		if code := round("/api/v1/results?lang=en", bad, 30); code != 400 {
			t.Fatalf("length %q: got %d, want 400", bad, code)
		}
	}
	_, all := call(t, h, "GET", "/api/v1/stats?lang=en", "")
	if all["sessionCount"].(float64) != 4 {
		t.Fatalf("all lengths: %v", all["sessionCount"])
	}
	if fmt.Sprint(all["lengths"]) != "[time-60 words-10 words-30]" {
		t.Fatalf("lengths = %v", all["lengths"])
	}
	_, timed := call(t, h, "GET", "/api/v1/stats?lang=en&length=time-60", "")
	sessions := timed["sessions"].([]any)
	if timed["sessionCount"].(float64) != 2 || len(sessions) != 2 || sessions[0].(map[string]any)["wpm"].(float64) != 50 {
		t.Fatalf("time-60: %v %v", timed["sessionCount"], sessions)
	}
	if code, _ := call(t, h, "GET", "/api/v1/stats?lang=en&length=nope", ""); code != 400 {
		t.Fatalf("unknown length in stats: %d", code)
	}
	// Climb keeps its own lengths
	if code := round("/api/v1/freeplay/results?lang=en", "time-30", 60); code != 200 {
		t.Fatalf("freeplay results: %d", code)
	}
	_, free := call(t, h, "GET", "/api/v1/freeplay/stats?lang=en&length=time-30", "")
	if free["sessionCount"].(float64) != 1 || fmt.Sprint(free["lengths"]) != "[time-30]" {
		t.Fatalf("freeplay: %v %v", free["sessionCount"], free["lengths"])
	}
	// the length survives export and import
	_, exp := call(t, h, "GET", "/api/v1/export?lang=en", "")
	raw, _ := json.Marshal(exp)
	call(t, h, "POST", "/api/v1/reset?lang=en", "")
	if code, out := call(t, h, "POST", "/api/v1/import?lang=en", string(raw)); code != 200 {
		t.Fatalf("import: %d %v", code, out)
	}
	_, back := call(t, h, "GET", "/api/v1/stats?lang=en&length=time-60", "")
	if back["sessionCount"].(float64) != 2 {
		t.Fatalf("after import time-60: %v", back["sessionCount"])
	}
}

// Rare words come in only after the whole alphabet is open, and only as the
// user keeps typing (engine.MaxRank): the letters of learning rounds finished
// with every letter open move the limit; free practice does not.
func TestApp_RareWordsAfterTheAlphabet(t *testing.T) {
	h, cfg, err := newApp()
	if err != nil {
		t.Fatal(err)
	}
	list, _ := os.ReadFile("data/langs/en/words.txt")
	rank := map[string]int{}
	for i, w := range strings.Fields(string(list)) {
		if _, ok := rank[w]; !ok {
			rank[w] = i
		}
	}
	// The words are random, so the mean is taken over 100 portions: with 30
	// the ratio after the ramp ranged from 1.9 to 2.7 and the test failed
	// about once in 40 runs. With 100 it stays between 2.1 and 2.4, and free
	// practice stays between 0.9 and 1.1, so the limits 1.5 and 1.8 below
	// sit well clear of both.
	meanRank := func() float64 {
		sum, n := 0, 0
		for i := 0; i < 100; i++ {
			_, out := call(t, h, "POST", "/api/v1/portion?lang=en", `{"start":true}`)
			for _, p := range out["portions"].([]any) {
				for _, w := range p.(map[string]any)["words"].([]any) {
					sum += rank[w.(string)]
					n++
				}
			}
		}
		return float64(sum) / float64(n)
	}
	call(t, h, "POST", "/api/v1/progress?lang=en", `{"unlockAll":true}`)
	start := meanRank()
	call(t, h, "POST", "/api/v1/freeplay/results?lang=en", `{"wpm":40,"accuracy":98,"chars":20000,"level":1}`)
	if again := meanRank(); again > 1.5*start {
		t.Fatalf("free practice moved the limit: mean rank %v, was %v", again, start)
	}
	body := fmt.Sprintf(`{"samples":[],"chars":%d,"wpm":40,"accuracy":98}`, int(cfg.Words.RampLetters))
	if code, out := call(t, h, "POST", "/api/v1/results?lang=en", body); code != 200 {
		t.Fatalf("results: %d %v", code, out)
	}
	if end := meanRank(); end < 1.8*start {
		t.Fatalf("after the ramp: mean rank %v, want much higher than %v", end, start)
	}
}

// The hidden study group: random words in learning, kept per language, on
// every round, in the stats and in export/import.
func TestApp_StudyGroup(t *testing.T) {
	h, _, _ := newApp()
	if code, _ := call(t, h, "POST", "/api/v1/group?lang=en", `{"group":"lazy"}`); code != 400 {
		t.Fatalf("unknown group: %d, want 400", code)
	}
	if code, _ := call(t, h, "POST", "/api/v1/group?lang=en", `{"group":"random"}`); code != 200 {
		t.Fatalf("group: %d", code)
	}
	_, out := call(t, h, "POST", "/api/v1/portion?lang=en", `{"start":true}`)
	for _, p := range out["portions"].([]any) {
		if p.(map[string]any)["focus"] != "" {
			t.Fatalf("random group: a portion has a focus letter: %v", p)
		}
	}
	call(t, h, "POST", "/api/v1/results?lang=en", `{"samples":[],"chars":40,"wpm":30,"accuracy":95}`)
	_, st := call(t, h, "GET", "/api/v1/stats?lang=en", "")
	sess := st["sessions"].([]any)[0].(map[string]any)
	if st["group"] != "random" || sess["group"] != "random" {
		t.Fatalf("stats: group %v, round group %v", st["group"], sess["group"])
	}
	if _, pl := call(t, h, "GET", "/api/v1/stats?lang=pl", ""); pl["group"] != "" {
		t.Fatalf("another language got the group: %v", pl["group"])
	}
	_, out = call(t, h, "POST", "/api/v1/portion?lang=pl", `{"start":true}`)
	if out["portions"].([]any)[0].(map[string]any)["focus"] == "" {
		t.Fatal("the normal app must still have a focus letter")
	}

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, guestRequest("GET", "/api/v1/export?lang=en", ""))
	exported := rec.Body.String()
	call(t, h, "POST", "/api/v1/reset?lang=en", "")
	if _, st := call(t, h, "GET", "/api/v1/stats?lang=en", ""); st["group"] != "" {
		t.Fatal("reset must clear the group")
	}
	if code, out := call(t, h, "POST", "/api/v1/import?lang=en", exported); code != 200 {
		t.Fatalf("import: %d %v", code, out)
	}
	if _, st := call(t, h, "GET", "/api/v1/stats?lang=en", ""); st["group"] != "random" {
		t.Fatal("import lost the group")
	}
}

// What a round was typed on is kept with it (learning), an unknown device
// is refused, and a page that does not send it stores "".
func TestApp_RoundDevice(t *testing.T) {
	h, _, _ := newApp()
	if code, _ := call(t, h, "POST", "/api/v1/results?lang=en", `{"samples":[],"chars":40,"wpm":30,"accuracy":95,"device":"fridge"}`); code != 400 {
		t.Fatalf("unknown device: %d, want 400", code)
	}
	call(t, h, "POST", "/api/v1/results?lang=en", `{"samples":[],"chars":40,"wpm":30,"accuracy":95}`)
	call(t, h, "POST", "/api/v1/results?lang=en", `{"samples":[],"chars":40,"wpm":30,"accuracy":95,"device":"touch"}`)
	_, st := call(t, h, "GET", "/api/v1/stats?lang=en", "")
	var devices []any
	for _, s := range st["sessions"].([]any) {
		devices = append(devices, s.(map[string]any)["device"])
	}
	if len(devices) != 2 || !slices.Contains(devices, "touch") || !slices.Contains(devices, nil) {
		t.Fatalf("devices in the history: %v", devices)
	}
}

// /activity puts every finished round, learning and free practice, on its
// day with its time; a wrong time zone is refused.
func TestApp_Activity(t *testing.T) {
	h, _, _ := newApp()
	if code, out := call(t, h, "GET", "/api/v1/activity?lang=en&tz=120", ""); code != 200 || len(out["days"].([]any)) != 0 {
		t.Fatalf("no rounds: %d %v, want 200 and no days", code, out)
	}
	body := `{"samples":[{"char":"e","errors":0,"ms":300},{"char":" ","errors":0,"ms":200}],"wpm":60,"accuracy":100,"chars":300}`
	if code, out := call(t, h, "POST", "/api/v1/results?lang=en", body); code != 200 {
		t.Fatalf("results: %d %v", code, out)
	}
	_, out := call(t, h, "GET", "/api/v1/activity?lang=en&tz=120", "")
	days := out["days"].([]any)
	if len(days) != 1 {
		t.Fatalf("one round: %v, want one day", days)
	}
	if d := days[0].(map[string]any); d["rounds"].(float64) != 1 || d["seconds"].(float64) != 60 || d["chars"].(float64) != 300 {
		t.Fatalf("day %v, want 1 round, 60 s, 300 letters", d)
	}
	for _, tz := range []string{"abc", "900", "-900"} {
		if code, _ := call(t, h, "GET", "/api/v1/activity?lang=en&tz="+tz, ""); code != 400 {
			t.Fatalf("tz=%s: %d, want 400", tz, code)
		}
	}
}

// /stats carries the fastest round of every length ("bests").
func TestApp_StatsBests(t *testing.T) {
	h, _, _ := newApp()
	for _, r := range []string{
		`{"samples":[{"char":"e","errors":0,"ms":300}],"wpm":40,"accuracy":95,"length":"words-10"}`,
		`{"samples":[{"char":"e","errors":0,"ms":300}],"wpm":60,"accuracy":98,"length":"words-10"}`,
		`{"samples":[{"char":"e","errors":0,"ms":300}],"wpm":50,"accuracy":90,"length":"time-30"}`,
	} {
		if code, out := call(t, h, "POST", "/api/v1/results?lang=en", r); code != 200 {
			t.Fatalf("results: %d %v", code, out)
		}
	}
	_, st := call(t, h, "GET", "/api/v1/stats?lang=en&length=words-10", "")
	bests := st["bests"].(map[string]any)
	w10 := bests["words-10"].(map[string]any)
	if len(bests) != 2 || w10["wpm"].(float64) != 60 || w10["accuracy"].(float64) != 98 {
		t.Fatalf("bests %v, want words-10 at 60 wpm 98%% and time-30", bests)
	}
}

// Learn's laps: when every letter is open and mastered, the next press
// starts the next lap, whose goal is 5 wpm higher (docs/ALGORITHM.md 6.1);
// /stats tells the lap and its goal, and the lap goes through export and
// import. The last lap is the last: no lap above it.
func TestApp_LearnLaps(t *testing.T) {
	h, _, _ := newApp()
	keys := []string{}
	for _, c := range "abcdefghijklmnopqrstuvwxyz" {
		// fast and clean enough for every goal up to 60 wpm (200 ms)
		keys = append(keys, fmt.Sprintf(`"%c":{"count":50,"errEma":0.01,"timeEma":150,"timedCount":50}`, c))
	}
	file := `{"unlocked":26,"keys":{` + strings.Join(keys, ",") + `}}`
	if code, out := call(t, h, "POST", "/api/v1/import?lang=en", file); code != 200 {
		t.Fatalf("import: %d %v", code, out)
	}
	_, st := call(t, h, "GET", "/api/v1/stats?lang=en", "")
	if st["lap"].(float64) != 0 || st["targetWpm"].(float64) != 30 || st["lastLap"].(float64) != 6 {
		t.Fatalf("before: lap %v goal %v last %v", st["lap"], st["targetWpm"], st["lastLap"])
	}
	if st["forecast"].(map[string]any)["known"] != false {
		t.Fatalf("no letter left to master, no forecast: %v", st["forecast"])
	}
	press := `{"samples":[{"char":"a","errors":0,"ms":150}]}`
	for lap := 1; lap <= 6; lap++ {
		_, out := call(t, h, "POST", "/api/v1/portion?lang=en", press)
		if want := 30 + 5*float64(lap); out["newLap"] != want {
			t.Fatalf("press %d: newLap %v, want %v", lap, out["newLap"], want)
		}
	}
	_, out := call(t, h, "POST", "/api/v1/portion?lang=en", press)
	if out["newLap"] != 0.0 {
		t.Fatalf("after the last lap: newLap %v, want 0", out["newLap"])
	}
	call(t, h, "POST", "/api/v1/results?lang=en", `{"samples":[],"chars":30,"wpm":50,"accuracy":100}`)
	_, st = call(t, h, "GET", "/api/v1/stats?lang=en", "")
	if st["lap"].(float64) != 6 || st["targetWpm"].(float64) != 60 {
		t.Fatalf("after: lap %v goal %v", st["lap"], st["targetWpm"])
	}
	if s := st["sessions"].([]any)[0].(map[string]any); s["lap"] != 6.0 {
		t.Fatalf("the round keeps its lap: %v", s["lap"])
	}

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, guestRequest("GET", "/api/v1/export?lang=en", ""))
	exported := rec.Body.String()
	if !strings.Contains(exported, `"lap":6`) {
		t.Fatalf("export lost the lap: %s", exported)
	}
	call(t, h, "POST", "/api/v1/reset?lang=en", "")
	call(t, h, "POST", "/api/v1/import?lang=en", exported)
	if _, st = call(t, h, "GET", "/api/v1/stats?lang=en", ""); st["lap"].(float64) != 6 {
		t.Fatalf("import lost the lap: %v", st["lap"])
	}
	for _, bad := range []string{`{"lap":7}`, `{"lap":-1}`, `{"sessions":[{"wpm":30,"accuracy":90,"lap":7}]}`} {
		if code, _ := call(t, h, "POST", "/api/v1/import?lang=en", bad); code != 400 {
			t.Errorf("%s: want 400, got %d", bad, code)
		}
	}
}

// /stats has the forecast of the Learn panel: after a few rounds in which
// every open letter got faster it has a number of rounds.
func TestApp_LearnForecast(t *testing.T) {
	h, _, _ := newApp()
	_, st := call(t, h, "GET", "/api/v1/stats?lang=en", "")
	if f := st["forecast"].(map[string]any); f["known"] != false {
		t.Fatalf("no rounds yet, no forecast: %v", f)
	}
	var open []string
	for _, k := range st["keys"].([]any) {
		if k := k.(map[string]any); k["unlocked"] == true {
			open = append(open, k["char"].(string))
		}
	}
	for i := range 8 {
		ms := 900 - 60*i // every open letter gets faster round by round
		var samples []string
		for _, c := range open {
			for range 3 {
				samples = append(samples, fmt.Sprintf(`{"char":%q,"errors":0,"ms":%d}`, c, ms))
			}
		}
		all := strings.Join(samples, ",")
		body := `{"samples":[` + all + `],"keys":[` + all + `],"chars":30,"wpm":20,"accuracy":100}`
		if code, out := call(t, h, "POST", "/api/v1/results?lang=en", body); code != 200 {
			t.Fatalf("results: %d %v", code, out)
		}
	}
	_, st = call(t, h, "GET", "/api/v1/stats?lang=en", "")
	f := st["forecast"].(map[string]any)
	if f["known"] != true || f["rounds"].(float64) < 1 {
		t.Fatalf("forecast after 8 improving rounds of %v: %v", open, f)
	}
}
