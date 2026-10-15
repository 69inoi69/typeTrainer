package main

// These tests run the whole app (real data files, real handlers, memory
// store) through HTTP requests, without starting a server.

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

func call(t *testing.T, h http.Handler, method, path, body string) (int, map[string]any) {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, guestRequest(method, path, body))
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
	h.ServeHTTP(rec, guestRequest("GET", "/api/v1/export?lang=en", ""))
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
	// free practice keeps its own lengths
	call(t, h, "POST", "/api/v1/freeplay/test?lang=en", `{"chars":150,"wpm":40,"accuracy":100}`)
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
