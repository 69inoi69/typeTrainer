package main

// These tests run the whole app (real data files, real handlers, memory
// store) through HTTP requests, without starting a server. This file has
// the shared helpers and what holds for the whole app (languages, export
// and import, round lengths, stats); each mode and the accounts have their
// own file: learn_test.go, climb_test.go, freetype_test.go, accounts_test.go.

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
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
