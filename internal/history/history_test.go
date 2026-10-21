package history

import (
	"testing"

	"typingtrainer/internal/storage"
)

func rounds(acc ...float64) []storage.Session {
	out := make([]storage.Session, len(acc))
	for i, a := range acc {
		out[i].Accuracy = a
	}
	return out
}

func TestAccuracyStreaksEmpty(t *testing.T) {
	got := AccuracyStreaks(nil, []float64{95, 100})
	if len(got) != 2 || got[0] != (Streak{Min: 95}) || got[1] != (Streak{Min: 100}) {
		t.Fatalf("no rounds: got %+v", got)
	}
	if got := AccuracyStreaks(rounds(99), nil); len(got) != 0 {
		t.Fatalf("no thresholds: got %+v", got)
	}
}

func TestAccuracyStreaks(t *testing.T) {
	// 96 97 100 | 90 | 98 100 100 100 | 95
	s := rounds(96, 97, 100, 90, 98, 100, 100, 100, 95)
	got := AccuracyStreaks(s, []float64{95, 97, 100})
	want := []Streak{
		{Min: 95, Longest: 5, Current: 5}, // 98 100 100 100 95
		{Min: 97, Longest: 4, Current: 0}, // 98 100 100 100; the last 95 breaks it
		{Min: 100, Longest: 3, Current: 0},
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("min %v: got %+v, want %+v", want[i].Min, got[i], want[i])
		}
	}
}

func TestAccuracyStreaksRounding(t *testing.T) {
	// 94.5 is shown as 95 and counts; 99.4 is shown as 99 and does not reach 100
	got := AccuracyStreaks(rounds(94.5, 99.4), []float64{95, 100})
	if got[0].Longest != 2 || got[1].Longest != 0 {
		t.Fatalf("got %+v", got)
	}
}
