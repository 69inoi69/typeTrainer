package storage

import (
	"testing"

	"typingtrainer/internal/engine"
)

// Progress in one language must never leak into another.
func TestMemoryStore_LanguagesAreSeparate(t *testing.T) {
	m := NewMemoryStore()
	m.SaveKeyStats("en", map[string]engine.KeyStat{"e": {Count: 5}})
	m.SetUnlocked("en", 9)
	m.AddSession("en", Session{WPM: 40})

	stats, _ := m.KeyStats("uk")
	unlocked, _ := m.Unlocked("uk")
	count, _ := m.SessionCount("uk")
	if len(stats) != 0 || unlocked != 0 || count != 0 {
		t.Fatalf("uk sees en data: stats=%v unlocked=%d sessions=%d", stats, unlocked, count)
	}
	if s, _ := m.KeyStats("en"); s["e"].Count != 5 {
		t.Fatalf("en stats lost: %v", s)
	}
}

func TestMemoryStore_KeyStatsIsACopy(t *testing.T) {
	m := NewMemoryStore()
	m.SaveKeyStats("en", map[string]engine.KeyStat{"a": {Count: 1}})
	s, _ := m.KeyStats("en")
	s["a"] = engine.KeyStat{Count: 99}
	if again, _ := m.KeyStats("en"); again["a"].Count != 1 {
		t.Fatal("changing the returned map changed the store")
	}
}

func TestMemoryStore_RecentSessionsNewestFirst(t *testing.T) {
	m := NewMemoryStore()
	for _, w := range []float64{10, 20, 30} {
		m.AddSession("pl", Session{WPM: w})
	}
	got, _ := m.RecentSessions("pl", 2)
	if len(got) != 2 || got[0].WPM != 30 || got[1].WPM != 20 {
		t.Fatalf("got %+v", got)
	}
}
