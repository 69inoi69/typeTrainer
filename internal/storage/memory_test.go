package storage

import (
	"testing"

	"typingtrainer/internal/engine"
)

// u is the user of the tests that are not about users.
const u = LocalUser

// Progress in one language must never leak into another.
func TestMemoryStore_LanguagesAreSeparate(t *testing.T) {
	m := NewMemoryStore()
	m.SaveKeyStats(u, "en", map[string]engine.KeyStat{"e": {Count: 5}})
	m.SetUnlocked(u, "en", 9)
	m.AddSession(u, "en", Session{WPM: 40})

	stats, _ := m.KeyStats(u, "uk")
	unlocked, _ := m.Unlocked(u, "uk")
	count, _ := m.SessionCount(u, "uk")
	if len(stats) != 0 || unlocked != 0 || count != 0 {
		t.Fatalf("uk sees en data: stats=%v unlocked=%d sessions=%d", stats, unlocked, count)
	}
	if s, _ := m.KeyStats(u, "en"); s["e"].Count != 5 {
		t.Fatalf("en stats lost: %v", s)
	}
}

func TestMemoryStore_KeyStatsIsACopy(t *testing.T) {
	m := NewMemoryStore()
	m.SaveKeyStats(u, "en", map[string]engine.KeyStat{"a": {Count: 1}})
	s, _ := m.KeyStats(u, "en")
	s["a"] = engine.KeyStat{Count: 99}
	if again, _ := m.KeyStats(u, "en"); again["a"].Count != 1 {
		t.Fatal("changing the returned map changed the store")
	}
}

func TestMemoryStore_RecentSessionsNewestFirst(t *testing.T) {
	m := NewMemoryStore()
	for _, w := range []float64{10, 20, 30} {
		m.AddSession(u, "pl", Session{WPM: w})
	}
	got, _ := m.RecentSessions(u, "pl", 2)
	if len(got) != 2 || got[0].WPM != 30 || got[1].WPM != 20 {
		t.Fatalf("got %+v", got)
	}
}

// Reset clears one language and leaves the others alone.
func TestMemoryStore_Reset(t *testing.T) {
	m := NewMemoryStore()
	for _, l := range []string{"en", "pl"} {
		m.SaveKeyStats(u, l, map[string]engine.KeyStat{"e": {Count: 5}})
		m.SetUnlocked(u, l, 9)
		m.AddSession(u, l, Session{WPM: 40})
	}
	if err := m.Reset(u, "en"); err != nil {
		t.Fatal(err)
	}
	stats, _ := m.KeyStats(u, "en")
	unlocked, _ := m.Unlocked(u, "en")
	count, _ := m.SessionCount(u, "en")
	if len(stats) != 0 || unlocked != 0 || count != 0 {
		t.Fatalf("en not reset: stats=%v unlocked=%d sessions=%d", stats, unlocked, count)
	}
	if c, _ := m.SessionCount(u, "pl"); c != 1 {
		t.Fatalf("pl lost its data: sessions=%d", c)
	}
	// resetting a language with no data is fine too
	if err := m.Reset(u, "uk"); err != nil {
		t.Fatal(err)
	}
}

// Free practice has its own history and test flag, apart from learning and
// per language; Reset clears them too.
func TestMemoryStore_Freeplay(t *testing.T) {
	m := NewMemoryStore()
	if p, _ := m.TestPassed(u, "en"); p {
		t.Fatal("a new language must start with the test not passed")
	}
	m.SetTestPassed(u, "en", true)
	for _, w := range []float64{50, 60} {
		m.AddFreeplaySession(u, "en", Session{WPM: w})
	}
	m.AddSession(u, "en", Session{WPM: 20})

	if c, _ := m.FreeplaySessionCount(u, "en"); c != 2 {
		t.Fatalf("freeplay sessions = %d, want 2", c)
	}
	if c, _ := m.SessionCount(u, "en"); c != 1 {
		t.Fatalf("learning sessions = %d, want 1 (freeplay must not mix in)", c)
	}
	if got, _ := m.RecentFreeplaySessions(u, "en", 5); len(got) != 2 || got[0].WPM != 60 {
		t.Fatalf("recent freeplay = %+v, want newest first", got)
	}
	if p, _ := m.TestPassed(u, "pl"); p {
		t.Fatal("the test flag leaked into another language")
	}
	m.Reset(u, "en")
	p, _ := m.TestPassed(u, "en")
	c, _ := m.FreeplaySessionCount(u, "en")
	if p || c != 0 {
		t.Fatalf("after reset: passed=%v sessions=%d", p, c)
	}
}

// One user's progress must never leak into another user's, and resetting
// one user leaves the other alone.
func TestMemoryStore_UsersAreSeparate(t *testing.T) {
	m := NewMemoryStore()
	m.SaveKeyStats("ann", "en", map[string]engine.KeyStat{"e": {Count: 5}})
	m.SetUnlocked("ann", "en", 9)
	m.AddSession("ann", "en", Session{WPM: 40})
	m.SetTestPassed("ann", "en", true)
	m.AddFreeplaySession("ann", "en", Session{WPM: 70})

	stats, _ := m.KeyStats("bob", "en")
	unlocked, _ := m.Unlocked("bob", "en")
	count, _ := m.SessionCount("bob", "en")
	passed, _ := m.TestPassed("bob", "en")
	free, _ := m.FreeplaySessionCount("bob", "en")
	if len(stats) != 0 || unlocked != 0 || count != 0 || passed || free != 0 {
		t.Fatalf("bob sees ann's data: stats=%v unlocked=%d sessions=%d passed=%v free=%d",
			stats, unlocked, count, passed, free)
	}

	m.SetUnlocked("bob", "en", 3)
	if err := m.Reset("ann", "en"); err != nil {
		t.Fatal(err)
	}
	if n, _ := m.Unlocked("bob", "en"); n != 3 {
		t.Fatalf("resetting ann changed bob: unlocked=%d", n)
	}
	if n, _ := m.Unlocked("ann", "en"); n != 0 {
		t.Fatalf("ann not reset: unlocked=%d", n)
	}
}

// Summary keeps the numbers and drops the raw keys, without changing the
// stored session.
func TestSession_Summary(t *testing.T) {
	s := Session{WPM: 40, Unlocked: 7, Keys: []engine.Sample{{Char: "a", Ms: 200}}}
	sum := s.Summary()
	if sum.Keys != nil || sum.WPM != 40 || sum.Unlocked != 7 {
		t.Fatalf("summary: %+v", sum)
	}
	if len(s.Keys) != 1 {
		t.Fatal("Summary changed the original session")
	}
}
