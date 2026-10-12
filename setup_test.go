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
		code, ex := call(t, h, "GET", "/api/v1/exercise?lang="+id, "")
		if code != 200 || ex["text"] == "" {
			t.Fatalf("%s: exercise %d %v", id, code, ex)
		}
		code, _ = call(t, h, "GET", "/api/v1/layout?lang="+id, "")
		if code != 200 {
			t.Fatalf("%s: layout %d", id, code)
		}
	}
}

func TestApp_UnknownLanguageIs400(t *testing.T) {
	h, _, _ := newApp()
	if code, _ := call(t, h, "GET", "/api/v1/exercise?lang=xx", ""); code != 400 {
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
	_, ex := call(t, h, "GET", "/api/v1/exercise?lang=ru", "")
	if len(ex["locked"].([]any)) == 0 {
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
		`{"keys":{"ж":{"count":1}}}`,               // not an English letter
		`{"keys":{"ab":{"count":1}}}`,              // not one character
		`{"keys":{"a":{"count":1,"mistakes":2}}}`,  // more mistakes than presses
		`{"keys":{"a":{"count":1,"errEma":1.5}}}`,  // probability above 1
		`{"keys":{"a":{"count":-1}}}`,              // negative count
		`{"sessions":[{"wpm":999,"accuracy":50}]}`, // impossible speed
		`{"sessions":[{"wpm":30,"accuracy":150}]}`, // impossible accuracy
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
