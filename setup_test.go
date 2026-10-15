package main

// These tests run the whole app (real data files, real handlers, memory
// store) through HTTP requests, without starting a server.

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func call(t *testing.T, h http.Handler, method, path, body string) (int, map[string]any) {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, path, strings.NewReader(body)))
	var out map[string]any
	json.Unmarshal(rec.Body.Bytes(), &out)
	return rec.Code, out
}

func TestApp_AllLanguagesLoad(t *testing.T) {
	h, _, err := newApp()
	if err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/v1/languages", nil))
	var langs []map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &langs); err != nil || len(langs) != 4 {
		t.Fatalf("languages: %s", rec.Body.String())
	}
	for _, l := range langs {
		id := l["id"].(string)
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

func TestApp_UnknownLanguageIs400(t *testing.T) {
	h, _, _ := newApp()
	if code, _ := call(t, h, "POST", "/api/v1/portion?lang=xx", "{}"); code != 400 {
		t.Fatalf("got %d, want 400", code)
	}
}

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
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/v1/export?lang=ru", nil))
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
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/v1/export?lang=ru", nil))
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

// Free practice: locked for a new user; the typing test opens it only at
// 30 WPM and 97 %; its rounds go to their own history and never change the
// letter statistics of learning; export/import carry it and reset clears it.
func TestApp_FreeplayAndTest(t *testing.T) {
	h, _, _ := newApp()
	_, st := call(t, h, "GET", "/api/v1/freeplay/stats?lang=en", "")
	if st["unlocked"] != false || st["testPassed"] != false {
		t.Fatalf("new user: %v", st)
	}
	// the words of the test come from the full list (any letter)
	code, out := call(t, h, "POST", "/api/v1/freeplay/portion?lang=en", `{"start":true}`)
	if code != 200 || len(out["portions"].([]any)) != 3 || out["round"] != float64(5) {
		t.Fatalf("freeplay portion: %d %v", code, out)
	}
	round := `{"wpm":55,"accuracy":99,"chars":150,"perSecond":[5,5,5,5,5,5,5,5]}`
	if code, _ := call(t, h, "POST", "/api/v1/freeplay/results?lang=en", round); code != 403 {
		t.Fatalf("locked freeplay results: %d, want 403", code)
	}
	// a failed test (too slow, then too inaccurate) changes nothing
	for _, body := range []string{`{"wpm":29,"accuracy":100,"chars":150}`, `{"wpm":80,"accuracy":96,"chars":150}`} {
		if _, out := call(t, h, "POST", "/api/v1/freeplay/test?lang=en", body); out["passed"] != false || out["unlocked"] != false {
			t.Fatalf("failed test %s: %v", body, out)
		}
	}
	if _, out := call(t, h, "POST", "/api/v1/freeplay/test?lang=en", `{"wpm":30,"accuracy":97,"chars":150}`); out["passed"] != true || out["unlocked"] != true {
		t.Fatalf("passed test: %v", out)
	}
	if _, pl := call(t, h, "GET", "/api/v1/freeplay/stats?lang=pl", ""); pl["unlocked"] != false {
		t.Fatal("the test of one language opened another")
	}
	if code, out := call(t, h, "POST", "/api/v1/freeplay/results?lang=en", round); code != 200 || out["consistency"] == nil {
		t.Fatalf("freeplay results: %d %v", code, out)
	}
	_, st = call(t, h, "GET", "/api/v1/freeplay/stats?lang=en", "")
	_, learn := call(t, h, "GET", "/api/v1/stats?lang=en", "")
	if st["sessionCount"] != float64(1) || learn["sessionCount"] != float64(0) {
		t.Fatalf("histories mixed: freeplay %v, learning %v", st["sessionCount"], learn["sessionCount"])
	}
	for _, k := range learn["keys"].([]any) {
		if k.(map[string]any)["count"] != float64(0) {
			t.Fatalf("freeplay changed the letter statistics: %v", k)
		}
	}

	// export -> reset -> import brings the flag and the history back
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/v1/export?lang=en", nil))
	file := rec.Body.String()
	call(t, h, "POST", "/api/v1/reset?lang=en", "")
	if _, st := call(t, h, "GET", "/api/v1/freeplay/stats?lang=en", ""); st["unlocked"] != false || st["sessionCount"] != float64(0) {
		t.Fatalf("reset did not clear free practice: %v", st)
	}
	if code, out := call(t, h, "POST", "/api/v1/import?lang=en", file); code != 200 {
		t.Fatalf("import: %d %v", code, out)
	}
	if _, st := call(t, h, "GET", "/api/v1/freeplay/stats?lang=en", ""); st["unlocked"] != true || st["sessionCount"] != float64(1) {
		t.Fatalf("import lost free practice: %v", st)
	}
}

// Every letter unlocked in learning opens free practice without the test.
func TestApp_FreeplayOpensWithAllLetters(t *testing.T) {
	h, _, _ := newApp()
	call(t, h, "POST", "/api/v1/progress?lang=uk", `{"unlockAll":true}`)
	if _, st := call(t, h, "GET", "/api/v1/freeplay/stats?lang=uk", ""); st["unlocked"] != true || st["testPassed"] != false {
		t.Fatalf("all letters open: %v", st)
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
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/v1/export?lang=ru", nil))
	exported := rec.Body.String()
	call(t, h, "POST", "/api/v1/reset?lang=ru", "")
	call(t, h, "POST", "/api/v1/import?lang=ru", exported)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/v1/export?lang=ru", nil))
	if rec.Body.String() != exported {
		t.Fatal("raw keys lost in an export/import round trip")
	}

	// free practice keeps its raw keys too, without touching the letters
	call(t, h, "POST", "/api/v1/progress?lang=ru", `{"unlockAll":true}`)
	free := `{"keys":[{"char":"ж","errors":0,"ms":250}],"chars":1,"wpm":60,"accuracy":100}`
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
