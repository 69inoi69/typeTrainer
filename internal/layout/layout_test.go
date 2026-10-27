package layout

import (
	"os"
	"sort"
	"strings"
	"testing"
)

func TestRestingKeys(t *testing.T) {
	for file, want := range map[string]string{
		"qwerty-en": "asdfjkl;",
		"jcuken-ru": "фываолдж",
		"jcuken-uk": "фіваолдж",
	} {
		data, err := os.ReadFile("../../data/layouts/" + file + ".json")
		if err != nil {
			t.Fatal(err)
		}
		l, err := Parse(data)
		if err != nil {
			t.Fatal(err)
		}
		got := l.RestingKeys()
		sort.Strings(got)
		w := strings.Split(want, "")
		sort.Strings(w)
		if strings.Join(got, "") != strings.Join(w, "") {
			t.Errorf("%s: got %v, want %v", file, got, w)
		}
	}
}

func TestRestingKeys_NoBumps(t *testing.T) {
	l := &Layout{Rows: [][]Key{{{Char: "a", Finger: "lp"}}}}
	if got := l.RestingKeys(); len(got) != 0 {
		t.Errorf("got %v, want none", got)
	}
}
