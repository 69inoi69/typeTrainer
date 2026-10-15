package storage

// The same tests run against every Store implementation (storeTests): the
// memory store always, PostgreSQL when a test database is configured
// (postgres_test.go). Both must behave exactly alike.

import (
	"errors"
	"testing"
	"time"

	"typingtrainer/internal/engine"
)

// u is the user of the tests that are not about users.
const u = LocalUser

// storeTests: every behaviour a Store must have.
var storeTests = map[string]func(*testing.T, Store){
	"LanguagesAreSeparate":      testLanguagesAreSeparate,
	"KeyStatsIsACopy":           testKeyStatsIsACopy,
	"RecentSessionsNewestFirst": testRecentSessionsNewestFirst,
	"Reset":                     testReset,
	"Freeplay":                  testFreeplay,
	"UsersAreSeparate":          testUsersAreSeparate,
	"Users":                     testUsers,
	"Logins":                    testLogins,
	"SessionFields":             testSessionFields,
	"KeyStatsFields":            testKeyStatsFields,
}

// runStoreTests runs every test on a fresh, empty store from newStore.
func runStoreTests(t *testing.T, newStore func(t *testing.T) Store) {
	for name, test := range storeTests {
		t.Run(name, func(t *testing.T) { test(t, newStore(t)) })
	}
}

func TestMemoryStore(t *testing.T) {
	runStoreTests(t, func(*testing.T) Store { return NewMemoryStore() })
}

// Progress in one language must never leak into another.
func testLanguagesAreSeparate(t *testing.T, m Store) {
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

func testKeyStatsIsACopy(t *testing.T, m Store) {
	m.SaveKeyStats(u, "en", map[string]engine.KeyStat{"a": {Count: 1}})
	s, _ := m.KeyStats(u, "en")
	s["a"] = engine.KeyStat{Count: 99}
	if again, _ := m.KeyStats(u, "en"); again["a"].Count != 1 {
		t.Fatal("changing the returned map changed the store")
	}
}

func testRecentSessionsNewestFirst(t *testing.T, m Store) {
	for _, w := range []float64{10, 20, 30} {
		m.AddSession(u, "pl", Session{WPM: w})
	}
	got, _ := m.RecentSessions(u, "pl", 2)
	if len(got) != 2 || got[0].WPM != 30 || got[1].WPM != 20 {
		t.Fatalf("got %+v", got)
	}
}

// Reset clears one language and leaves the others alone.
func testReset(t *testing.T, m Store) {
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
func testFreeplay(t *testing.T, m Store) {
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
func testUsersAreSeparate(t *testing.T, m Store) {
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

func testUsers(t *testing.T, m Store) {
	now := time.Now()
	a, err := m.CreateUser("ann", "hash-a", now)
	if err != nil || a.ID == "" || a.ID == LocalUser {
		t.Fatalf("create: %+v %v", a, err)
	}
	if _, err := m.CreateUser("ann", "other", now); !errors.Is(err, ErrNameTaken) {
		t.Fatalf("second ann: %v, want ErrNameTaken", err)
	}
	b, _ := m.CreateUser("bob", "hash-b", now)
	if b.ID == a.ID {
		t.Fatal("two users got the same id")
	}
	if got, err := m.UserByName("ann"); err != nil || got.PasswordHash != "hash-a" {
		t.Fatalf("by name: %+v %v", got, err)
	}
	if got, err := m.UserByID(b.ID); err != nil || got.Name != "bob" {
		t.Fatalf("by id: %+v %v", got, err)
	}
	if _, err := m.UserByID(LocalUser); !errors.Is(err, ErrNotFound) {
		t.Fatal("the guest is not an account")
	}
	if _, err := m.UserByName("nobody"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown name: %v, want ErrNotFound", err)
	}
}

// A login works until it expires or is deleted.
func testLogins(t *testing.T, m Store) {
	now := time.Now()
	m.AddLogin("t1", "u1", now.Add(time.Hour))
	if id, err := m.LoginUser("t1", now); err != nil || id != "u1" {
		t.Fatalf("login: %q %v", id, err)
	}
	if _, err := m.LoginUser("t1", now.Add(2*time.Hour)); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expired login: %v, want ErrNotFound", err)
	}
	if _, err := m.LoginUser("t1", now); !errors.Is(err, ErrNotFound) {
		t.Fatal("an expired login must be forgotten")
	}
	m.AddLogin("t2", "u1", now.Add(time.Hour))
	m.DeleteLogin("t2")
	if _, err := m.LoginUser("t2", now); !errors.Is(err, ErrNotFound) {
		t.Fatal("a deleted login still works")
	}
	if _, err := m.LoginUser("never", now); !errors.Is(err, ErrNotFound) {
		t.Fatal("an unknown login works")
	}
}

// Every field of a session comes back as it was stored, the raw keys too.
func testSessionFields(t *testing.T, m Store) {
	c := 81.5
	when := time.Date(2026, 10, 15, 18, 30, 0, 0, time.UTC)
	in := Session{WPM: 42.5, Accuracy: 97.25, Chars: 180, Consistency: &c, FinishedAt: when,
		Keys: []engine.Sample{{Char: "ж", Errors: 1, Ms: 0}, {Char: " ", Errors: 0, Ms: 183}}, Unlocked: 7}
	m.AddSession(u, "ru", in)
	m.AddSession(u, "ru", Session{WPM: 10, FinishedAt: when}) // no consistency, no keys
	got, err := m.RecentSessions(u, "ru", 5)
	if err != nil || len(got) != 2 {
		t.Fatalf("got %+v %v", got, err)
	}
	old, s := got[0], got[1]
	if s.WPM != 42.5 || s.Accuracy != 97.25 || s.Chars != 180 || s.Unlocked != 7 ||
		s.Consistency == nil || *s.Consistency != 81.5 || !s.FinishedAt.Equal(when) {
		t.Fatalf("fields changed: %+v", s)
	}
	if len(s.Keys) != 2 || s.Keys[0] != in.Keys[0] || s.Keys[1] != in.Keys[1] {
		t.Fatalf("keys changed: %+v", s.Keys)
	}
	if old.Consistency != nil || len(old.Keys) != 0 {
		t.Fatalf("missing values must stay missing: %+v", old)
	}
}

// Every field of a letter comes back as it was stored, and SaveKeyStats
// replaces the whole set (a letter left out is gone).
func testKeyStatsFields(t *testing.T, m Store) {
	k := engine.KeyStat{Count: 25, Mistakes: 3, ErrEMA: 0.0625, TimeEMA: 412.75, TimedCount: 20}
	m.SaveKeyStats(u, "pl", map[string]engine.KeyStat{"ą": k, " ": {Count: 1}})
	got, _ := m.KeyStats(u, "pl")
	if len(got) != 2 || got["ą"] != k || got[" "].Count != 1 {
		t.Fatalf("got %+v", got)
	}
	m.SaveKeyStats(u, "pl", map[string]engine.KeyStat{"a": {Count: 2}})
	got, _ = m.KeyStats(u, "pl")
	if len(got) != 1 || got["a"].Count != 2 {
		t.Fatalf("not replaced: %+v", got)
	}
}
