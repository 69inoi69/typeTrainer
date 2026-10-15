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

// Reset clears one language and leaves the others alone.
func TestMemoryStore_Reset(t *testing.T) {
	m := NewMemoryStore()
	for _, l := range []string{"en", "pl"} {
		m.SaveKeyStats(l, map[string]engine.KeyStat{"e": {Count: 5}})
		m.SetUnlocked(l, 9)
		m.AddSession(l, Session{WPM: 40})
	}
	if err := m.Reset("en"); err != nil {
		t.Fatal(err)
	}
	stats, _ := m.KeyStats("en")
	unlocked, _ := m.Unlocked("en")
	count, _ := m.SessionCount("en")
	if len(stats) != 0 || unlocked != 0 || count != 0 {
		t.Fatalf("en not reset: stats=%v unlocked=%d sessions=%d", stats, unlocked, count)
	}
	if c, _ := m.SessionCount("pl"); c != 1 {
		t.Fatalf("pl lost its data: sessions=%d", c)
	}
	// resetting a language with no data is fine too
	if err := m.Reset("uk"); err != nil {
		t.Fatal(err)
	}
}

// Free practice has its own history and test flag, apart from learning and
// per language; Reset clears them too.
func TestMemoryStore_Freeplay(t *testing.T) {
	m := NewMemoryStore()
	if p, _ := m.TestPassed("en"); p {
		t.Fatal("a new language must start with the test not passed")
	}
	m.SetTestPassed("en", true)
	for _, w := range []float64{50, 60} {
		m.AddFreeplaySession("en", Session{WPM: w})
	}
	m.AddSession("en", Session{WPM: 20})

	if c, _ := m.FreeplaySessionCount("en"); c != 2 {
		t.Fatalf("freeplay sessions = %d, want 2", c)
	}
	if c, _ := m.SessionCount("en"); c != 1 {
		t.Fatalf("learning sessions = %d, want 1 (freeplay must not mix in)", c)
	}
	if got, _ := m.RecentFreeplaySessions("en", 5); len(got) != 2 || got[0].WPM != 60 {
		t.Fatalf("recent freeplay = %+v, want newest first", got)
	}
	if p, _ := m.TestPassed("pl"); p {
		t.Fatal("the test flag leaked into another language")
	}
	m.Reset("en")
	p, _ := m.TestPassed("en")
	c, _ := m.FreeplaySessionCount("en")
	if p || c != 0 {
		t.Fatalf("after reset: passed=%v sessions=%d", p, c)
	}
}
