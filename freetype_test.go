package main

// Freetype through the whole app.

import (
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestApp_Freetype(t *testing.T) {
	h, _, _ := newApp()
	_, st := call(t, h, "GET", "/api/v1/freetype/stats?lang=en", "")
	lists := fmt.Sprint(st["lists"])
	if lists != "[200 1000 5000 10000 25000]" || st["list"] != float64(200) || st["sessionCount"] != float64(0) {
		t.Fatalf("new user: lists %v, list %v, rounds %v", lists, st["list"], st["sessionCount"])
	}
	if _, ru := call(t, h, "GET", "/api/v1/freetype/stats?lang=ru", ""); fmt.Sprint(ru["lists"]) != "[200 1000]" {
		t.Fatalf("ru lists: %v", ru["lists"])
	}
	code, out := call(t, h, "POST", "/api/v1/freetype/portion?lang=en", `{"start":true,"list":200,"words":10}`)
	if code != 200 || len(out["portions"].([]any)) != 2 || out["level"] != nil {
		t.Fatalf("first portions: %d %v", code, out)
	}
	for _, p := range out["portions"].([]any) {
		for _, w := range p.(map[string]any)["words"].([]any) {
			if w != strings.ToLower(w.(string)) || strings.ContainsAny(w.(string), ",.") {
				t.Fatalf("Freetype words are plain: %q", w)
			}
		}
	}
	for _, bad := range []string{`{"start":true,"list":300}`, `{"start":true}`, `{"start":true,"list":200,"words":61}`} {
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
