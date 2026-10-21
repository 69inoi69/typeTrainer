package main

// Learn through the whole app: portions, results, the word list after the
// alphabet, the hidden control group, laps and the forecast.
// Helpers (call, guestRequest) are in setup_test.go.

import (
	"fmt"
	"net/http/httptest"
	"os"
	"slices"
	"strings"
	"testing"
)

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
