package main

// Learn through the whole app.

import (
	"errors"
	"fmt"
	"net/http/httptest"
	"os"
	"slices"
	"strings"
	"testing"

	"typingtrainer/internal/storage"
)

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

func TestApp_ResultsSentTwice(t *testing.T) {
	h, _, _ := newApp()
	body := `{"samples":[{"char":"a","errors":0,"ms":300},{"char":"s","errors":1,"ms":400}],"wpm":30,"accuracy":90,"round":"5f0c2a9e-1"}`
	for i := range 2 {
		if code, out := call(t, h, "POST", "/api/v1/results?lang=en", body); code != 200 {
			t.Fatalf("send %d: %d %v", i+1, code, out)
		}
	}
	_, st := call(t, h, "GET", "/api/v1/stats?lang=en", "")
	if n := st["sessionCount"].(float64); n != 1 {
		t.Fatalf("%v rounds, want 1", n)
	}
	for _, k := range st["keys"].([]any) {
		if k := k.(map[string]any); (k["char"] == "a" || k["char"] == "s") && k["count"].(float64) != 1 {
			t.Fatalf("%v learned %v times, want 1", k["char"], k["count"])
		}
	}
	call(t, h, "POST", "/api/v1/results?lang=en", strings.Replace(body, "5f0c2a9e-1", "5f0c2a9e-2", 1))
	if _, st = call(t, h, "GET", "/api/v1/stats?lang=en", ""); st["sessionCount"].(float64) != 2 {
		t.Fatalf("a new id: %v rounds, want 2", st["sessionCount"])
	}
	if code, _ := call(t, h, "POST", "/api/v1/results?lang=en", strings.Replace(body, "5f0c2a9e-1", "a b", 1)); code != 400 {
		t.Fatalf("round id with a space: %d, want 400", code)
	}
}

type failingStore struct {
	storage.Store
	fail bool
}

var errStoreDown = errors.New("store down on purpose")

func (f *failingStore) AddSession(user, lang string, s storage.Session) error {
	if f.fail {
		f.fail = false
		return errStoreDown
	}
	return f.Store.AddSession(user, lang, s)
}

func (f *failingStore) SaveLearned(user, lang string, l storage.Learned) error {
	if f.fail && l.Session != nil {
		f.fail = false
		return errStoreDown
	}
	return f.Store.SaveLearned(user, lang, l)
}

func TestApp_ResultsAfterAFailedSave(t *testing.T) {
	store := &failingStore{Store: storage.NewMemoryStore(), fail: true}
	h, _, err := newAppWith(func() (storage.Store, error) { return store, nil })
	if err != nil {
		t.Fatal(err)
	}
	body := `{"samples":[{"char":"a","errors":0,"ms":300},{"char":"s","errors":1,"ms":400}],"wpm":30,"accuracy":90,"round":"5f0c2a9e-1"}`
	if code, _ := call(t, h, "POST", "/api/v1/results?lang=en", body); code != 500 {
		t.Fatalf("first send: %d, want 500 (the store fails)", code)
	}
	if code, out := call(t, h, "POST", "/api/v1/results?lang=en", body); code != 200 {
		t.Fatalf("second send: %d %v", code, out)
	}
	_, st := call(t, h, "GET", "/api/v1/stats?lang=en", "")
	if n := st["sessionCount"].(float64); n != 1 {
		t.Fatalf("%v rounds, want 1", n)
	}
	for _, k := range st["keys"].([]any) {
		if k := k.(map[string]any); (k["char"] == "a" || k["char"] == "s") && k["count"].(float64) != 1 {
			t.Fatalf("%v learned %v times, want 1", k["char"], k["count"])
		}
	}
}

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

func TestApp_LearnLaps(t *testing.T) {
	h, _, _ := newApp()
	keys := []string{}
	for _, c := range "abcdefghijklmnopqrstuvwxyz" {
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
		ms := 900 - 60*i
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
