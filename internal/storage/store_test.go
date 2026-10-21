package storage

// The same tests run against every Store implementation (storeTests): the
// memory store always, PostgreSQL when a test database is configured
// (postgres_test.go). Both must behave exactly alike.

import (
	"errors"
	"fmt"
	"math"
	"testing"
	"time"

	"typingtrainer/internal/engine"
)

// u is the user of the tests that are not about users.
const u = LocalUser

// storeTests: every behaviour a Store must have. To test a new Store
// method, add a function here; it then runs against both stores.
var storeTests = map[string]func(*testing.T, Store){
	"LanguagesAreSeparate":      testLanguagesAreSeparate,
	"KeyStatsIsACopy":           testKeyStatsIsACopy,
	"RecentSessionsNewestFirst": testRecentSessionsNewestFirst,
	"Reset":                     testReset,
	"Freeplay":                  testFreeplay,
	"FreetypeModes":             testFreetypeModes,
	"UsersAreSeparate":          testUsersAreSeparate,
	"Users":                     testUsers,
	"Logins":                    testLogins,
	"SessionFields":             testSessionFields,
	"KeyStatsFields":            testKeyStatsFields,
	"Lengths":                   testLengths,
	"LettersTyped":              testLettersTyped,
	"Group":                     testGroup,
	"Lap":                       testLap,
	"Device":                    testDevice,
	"PracticeDays":              testPracticeDays,
	"BestRounds":                testBestRounds,
}

// runStoreTests runs every test on a fresh, empty store from newStore.
func runStoreTests(t *testing.T, newStore func(t *testing.T) Store) {
	for name, test := range storeTests {
		t.Run(name, func(t *testing.T) { test(t, newStore(t)) })
	}
}

// TestMemoryStore runs every store test against MemoryStore.
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
	count, _ := m.SessionCount(u, "uk", "")
	if len(stats) != 0 || unlocked != 0 || count != 0 {
		t.Fatalf("uk sees en data: stats=%v unlocked=%d sessions=%d", stats, unlocked, count)
	}
	if s, _ := m.KeyStats(u, "en"); s["e"].Count != 5 {
		t.Fatalf("en stats lost: %v", s)
	}
}

// Changing the map KeyStats returned must not change what is stored.
func testKeyStatsIsACopy(t *testing.T, m Store) {
	m.SaveKeyStats(u, "en", map[string]engine.KeyStat{"a": {Count: 1}})
	s, _ := m.KeyStats(u, "en")
	s["a"] = engine.KeyStat{Count: 99}
	if again, _ := m.KeyStats(u, "en"); again["a"].Count != 1 {
		t.Fatal("changing the returned map changed the store")
	}
}

// RecentSessions returns the newest rounds first and no more than limit.
func testRecentSessionsNewestFirst(t *testing.T, m Store) {
	for _, w := range []float64{10, 20, 30} {
		m.AddSession(u, "pl", Session{WPM: w})
	}
	got, _ := m.RecentSessions(u, "pl", "", 2)
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
	count, _ := m.SessionCount(u, "en", "")
	if len(stats) != 0 || unlocked != 0 || count != 0 {
		t.Fatalf("en not reset: stats=%v unlocked=%d sessions=%d", stats, unlocked, count)
	}
	if c, _ := m.SessionCount(u, "pl", ""); c != 1 {
		t.Fatalf("pl lost its data: sessions=%d", c)
	}
	// resetting a language with no data is fine too
	if err := m.Reset(u, "uk"); err != nil {
		t.Fatal(err)
	}
}

// Climb has its own history, apart from learning and per language, with
// the level of each round; Reset clears it too.
func testFreeplay(t *testing.T, m Store) {
	for _, w := range []float64{50, 60} {
		m.AddFreeplaySession(u, "en", ModeClimb, Session{WPM: w, Level: w / 100})
	}
	m.AddSession(u, "en", Session{WPM: 20})

	if c, _ := m.FreeplaySessionCount(u, "en", ModeClimb, ""); c != 2 {
		t.Fatalf("freeplay sessions = %d, want 2", c)
	}
	if c, _ := m.SessionCount(u, "en", ""); c != 1 {
		t.Fatalf("learning sessions = %d, want 1 (freeplay must not mix in)", c)
	}
	if got, _ := m.RecentFreeplaySessions(u, "en", ModeClimb, "", 5); len(got) != 2 || got[0].WPM != 60 || got[0].Level != 0.6 {
		t.Fatalf("recent freeplay = %+v, want newest first, with its level", got)
	}
	if c, _ := m.FreeplaySessionCount(u, "pl", ModeClimb, ""); c != 0 {
		t.Fatal("the history leaked into another language")
	}
	m.Reset(u, "en")
	if c, _ := m.FreeplaySessionCount(u, "en", ModeClimb, ""); c != 0 {
		t.Fatalf("after reset: sessions=%d", c)
	}
}

// Every Freetype word list is a history of its own, apart from Climb's;
// all of them count as practice days, and Reset clears them all.
func testFreetypeModes(t *testing.T, m Store) {
	small, big := FreetypeMode(200, ""), FreetypeMode(25000, "")
	if small != "freetype-200" {
		t.Fatalf("FreetypeMode(200) = %q", small)
	}
	// the variants (2026-10-21): each its own history, apart from the plain list
	long, sentences := FreetypeMode(200, VariantLong), FreetypeMode(0, VariantSentences)
	if long != "freetype-200-long" || sentences != "freetype-sentences" {
		t.Fatalf("variant modes = %q, %q", long, sentences)
	}
	at := time.Date(2026, 10, 19, 12, 0, 0, 0, time.UTC)
	m.AddFreeplaySession(u, "en", small, Session{WPM: 80, Length: "words-30", FinishedAt: at})
	m.AddFreeplaySession(u, "en", small, Session{WPM: 90, Length: "time-30", FinishedAt: at})
	m.AddFreeplaySession(u, "en", big, Session{WPM: 50, Length: "words-30", FinishedAt: at})
	m.AddFreeplaySession(u, "en", ModeClimb, Session{WPM: 60, FinishedAt: at})
	for _, mode := range []string{long, sentences} {
		if err := m.AddFreeplaySession(u, "en", mode, Session{WPM: 40, Length: "words-30", FinishedAt: at}); err != nil {
			t.Fatalf("%s: %v", mode, err)
		}
	}

	for mode, want := range map[string]int{small: 2, big: 1, ModeClimb: 1, FreetypeMode(1000, ""): 0, long: 1, sentences: 1} {
		if c, _ := m.FreeplaySessionCount(u, "en", mode, ""); c != want {
			t.Errorf("%s: %d rounds, want %d", mode, c, want)
		}
	}
	if got, _ := m.RecentFreeplaySessions(u, "en", big, "", 5); len(got) != 1 || got[0].WPM != 50 {
		t.Errorf("recent of %s = %+v, want only its own round", big, got)
	}
	if l, _ := m.FreeplaySessionLengths(u, "en", small); len(l) != 2 {
		t.Errorf("lengths of %s = %v, want 2", small, l)
	}
	if b, _ := m.BestFreeplayRounds(u, "en", small); b["words-30"].WPM != 80 || b["time-30"].WPM != 90 {
		t.Errorf("bests of %s = %+v", small, b)
	}
	if b, _ := m.BestFreeplayRounds(u, "en", big); b["words-30"].WPM != 50 {
		t.Errorf("bests of %s = %+v, want its own 50", big, b)
	}
	if days, _ := m.PracticeDays(u, "en", 0); len(days) != 1 || days[0].Rounds != 6 {
		t.Errorf("practice days = %+v, want one day with all 6 rounds", days)
	}
	m.Reset(u, "en")
	if c, _ := m.FreeplaySessionCount(u, "en", small, ""); c != 0 {
		t.Errorf("after reset: %d rounds", c)
	}
}

// One user's progress must never leak into another user's, and resetting
// one user leaves the other alone.
func testUsersAreSeparate(t *testing.T, m Store) {
	m.SaveKeyStats("ann", "en", map[string]engine.KeyStat{"e": {Count: 5}})
	m.SetUnlocked("ann", "en", 9)
	m.AddSession("ann", "en", Session{WPM: 40})
	m.AddFreeplaySession("ann", "en", ModeClimb, Session{WPM: 70})

	stats, _ := m.KeyStats("bob", "en")
	unlocked, _ := m.Unlocked("bob", "en")
	count, _ := m.SessionCount("bob", "en", "")
	free, _ := m.FreeplaySessionCount("bob", "en", ModeClimb, "")
	if len(stats) != 0 || unlocked != 0 || count != 0 || free != 0 {
		t.Fatalf("bob sees ann's data: stats=%v unlocked=%d sessions=%d free=%d",
			stats, unlocked, count, free)
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

// Accounts: unique names, distinct ids, lookup by name and by id, and the
// guest is never an account.
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
	got, err := m.RecentSessions(u, "ru", "", 5)
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
	k := engine.KeyStat{Count: 25, Mistakes: 3, ErrEMA: 0.0625, TimeEMA: 412.75, TimedCount: 20, Held: true}
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

// Rounds of different lengths are counted and listed apart; a session
// without a length is a 30-word round (DefaultLength).
func testLengths(t *testing.T, m Store) {
	m.AddSession(u, "en", Session{WPM: 30}) // old: no length
	m.AddSession(u, "en", Session{WPM: 40, Length: "time-60"})
	m.AddSession(u, "en", Session{WPM: 50, Length: "words-10"})
	m.AddSession(u, "en", Session{WPM: 60, Length: "time-60"})
	m.AddFreeplaySession(u, "en", ModeClimb, Session{WPM: 70, Length: "words-60"})

	if c, _ := m.SessionCount(u, "en", ""); c != 4 {
		t.Fatalf("all lengths: %d, want 4", c)
	}
	if c, _ := m.SessionCount(u, "en", "time-60"); c != 2 {
		t.Fatalf("time-60: %d, want 2", c)
	}
	got, _ := m.RecentSessions(u, "en", "time-60", 5)
	if len(got) != 2 || got[0].WPM != 60 || got[1].WPM != 40 || got[0].Length != "time-60" {
		t.Fatalf("time-60 rounds: %+v", got)
	}
	if old, _ := m.RecentSessions(u, "en", DefaultLength, 5); len(old) != 1 || old[0].WPM != 30 || old[0].Length != DefaultLength {
		t.Fatalf("a round without a length must be %s: %+v", DefaultLength, old)
	}
	lengths, _ := m.SessionLengths(u, "en")
	if want := []string{"time-60", "words-10", "words-30"}; fmt.Sprint(lengths) != fmt.Sprint(want) {
		t.Fatalf("lengths = %v, want %v", lengths, want)
	}
	free, _ := m.FreeplaySessionLengths(u, "en", ModeClimb)
	if fmt.Sprint(free) != "[words-60]" {
		t.Fatalf("free lengths = %v (learning must not mix in)", free)
	}
	if c, _ := m.FreeplaySessionCount(u, "en", ModeClimb, "words-60"); c != 1 {
		t.Fatalf("free words-60: %d", c)
	}
	if none, _ := m.SessionLengths(u, "pl"); none == nil || len(none) != 0 {
		t.Fatalf("no history: lengths must be an empty list, got %#v", none)
	}
}

// LettersTyped adds up the letters of this user's learning rounds in this
// language that ended with enough letters open; free practice never counts.
func testLettersTyped(t *testing.T, m Store) {
	if n, err := m.LettersTyped(u, "en", 26); err != nil || n != 0 {
		t.Fatalf("no history: %d, %v; want 0", n, err)
	}
	m.AddSession(u, "en", Session{Chars: 100, Unlocked: 20}) // still learning letters
	m.AddSession(u, "en", Session{Chars: 150, Unlocked: 26})
	m.AddSession(u, "en", Session{Chars: 50, Unlocked: 26})
	m.AddSession(u, "pl", Session{Chars: 999, Unlocked: 32})              // another language
	m.AddSession("someone-else", "en", Session{Chars: 999, Unlocked: 26}) // another user
	m.AddFreeplaySession(u, "en", ModeClimb, Session{Chars: 999})         // free practice never counts
	if n, _ := m.LettersTyped(u, "en", 26); n != 200 {
		t.Fatalf("all letters open: %d, want 200", n)
	}
	if n, _ := m.LettersTyped(u, "en", 20); n != 300 {
		t.Fatalf("at least 20 open: %d, want 300", n)
	}
	m.Reset(u, "en")
	if n, _ := m.LettersTyped(u, "en", 0); n != 0 {
		t.Fatalf("after reset: %d, want 0", n)
	}
}

// The study group is kept per language, does not touch the rest of the
// progress, is stored with each round, and Reset clears it.
// Learn's lap: 0 for a new user, per language, beside the other progress
// fields, kept with each round, and gone with a reset.
func testLap(t *testing.T, m Store) {
	if n, err := m.Lap(u, "en"); err != nil || n != 0 {
		t.Fatalf("new user: lap %d, %v", n, err)
	}
	m.SetUnlocked(u, "en", 26)
	m.SetGroup(u, "en", GroupRandom)
	if err := m.SetLap(u, "en", 2); err != nil {
		t.Fatal(err)
	}
	if n, _ := m.Lap(u, "en"); n != 2 {
		t.Fatalf("lap = %d, want 2", n)
	}
	if n, _ := m.Unlocked(u, "en"); n != 26 {
		t.Fatalf("the lap changed unlocked to %d", n)
	}
	if g, _ := m.Group(u, "en"); g != GroupRandom {
		t.Fatalf("the lap changed the group to %q", g)
	}
	if n, _ := m.Lap(u, "pl"); n != 0 {
		t.Fatalf("another language: lap %d", n)
	}
	m.AddSession(u, "en", Session{WPM: 40, Lap: 2})
	if got, _ := m.RecentSessions(u, "en", "", 1); len(got) != 1 || got[0].Lap != 2 {
		t.Fatalf("session lap lost: %+v", got)
	}
	m.Reset(u, "en")
	if n, _ := m.Lap(u, "en"); n != 0 {
		t.Fatalf("after reset: lap %d", n)
	}
}

func testGroup(t *testing.T, m Store) {
	if g, err := m.Group(u, "en"); err != nil || g != "" {
		t.Fatalf("new user: %q, %v; want \"\"", g, err)
	}
	m.SetUnlocked(u, "en", 7) // the group must not touch the progress row's other fields
	m.SetGroup(u, "en", GroupRandom)
	if g, _ := m.Group(u, "en"); g != GroupRandom {
		t.Fatalf("group = %q, want %q", g, GroupRandom)
	}
	if n, _ := m.Unlocked(u, "en"); n != 7 {
		t.Fatalf("unlocked changed to %d", n)
	}
	if g, _ := m.Group(u, "pl"); g != "" {
		t.Fatalf("another language got group %q", g)
	}
	m.AddSession(u, "en", Session{WPM: 30, Group: GroupRandom})
	if got, _ := m.RecentSessions(u, "en", "", 1); len(got) != 1 || got[0].Group != GroupRandom {
		t.Fatalf("session group lost: %+v", got)
	}
	m.SetGroup(u, "en", "")
	if g, _ := m.Group(u, "en"); g != "" {
		t.Fatalf("back to normal: %q", g)
	}
	m.SetGroup(u, "en", GroupRandom)
	m.Reset(u, "en")
	if g, _ := m.Group(u, "en"); g != "" {
		t.Fatalf("after reset: %q", g)
	}
}

// The device is stored with each round, in both modes; "" stays "".
func testDevice(t *testing.T, m Store) {
	m.AddSession(u, "en", Session{WPM: 30, Device: DeviceTouch})
	m.AddSession(u, "en", Session{WPM: 31})
	m.AddFreeplaySession(u, "en", ModeClimb, Session{WPM: 40, Device: DeviceKeyboard})
	got, _ := m.RecentSessions(u, "en", "", 2)
	if len(got) != 2 || got[0].Device != "" || got[1].Device != DeviceTouch {
		t.Fatalf("learning devices: %+v", got)
	}
	free, _ := m.RecentFreeplaySessions(u, "en", ModeClimb, "", 1)
	if len(free) != 1 || free[0].Device != DeviceKeyboard {
		t.Fatalf("free practice device: %+v", free)
	}
}

// PracticeDays puts the rounds of both modes on the user's local days,
// adds up their time and letters, keeps users and languages apart, and
// Reset clears it.
func testPracticeDays(t *testing.T, m Store) {
	if days, err := m.PracticeDays(u, "en", 0); err != nil || len(days) != 0 {
		t.Fatalf("no history: %v, %v; want none", days, err)
	}
	at := func(s string) time.Time { v, _ := time.Parse(time.RFC3339, s); return v }
	// 60 wpm, 100%: 300 letters = 60 words = 1 minute
	m.AddSession(u, "en", Session{WPM: 60, Accuracy: 100, Chars: 300, FinishedAt: at("2026-10-17T10:00:00Z")})
	m.AddFreeplaySession(u, "en", ModeClimb, Session{WPM: 30, Accuracy: 100, Chars: 150, FinishedAt: at("2026-10-17T22:30:00Z")})
	m.AddSession(u, "en", Session{WPM: 0, Accuracy: 0, Chars: 0, FinishedAt: at("2026-10-18T09:00:00Z")})                   // WPM 0: no time
	m.AddSession(u, "pl", Session{WPM: 60, Accuracy: 100, Chars: 300, FinishedAt: at("2026-10-17T10:00:00Z")})              // another language
	m.AddSession("someone-else", "en", Session{WPM: 60, Accuracy: 100, Chars: 300, FinishedAt: at("2026-10-17T10:00:00Z")}) // another user

	days, err := m.PracticeDays(u, "en", 0)
	if err != nil || len(days) != 2 {
		t.Fatalf("UTC: %v, %v; want 2 days", days, err)
	}
	if d := days[0]; d.Date != "2026-10-17" || d.Rounds != 2 || d.Chars != 450 || math.Abs(d.Seconds-120) > 0.01 {
		t.Fatalf("first day %+v, want 2026-10-17, 2 rounds, 450 letters, 120 s", d)
	}
	if d := days[1]; d.Date != "2026-10-18" || d.Rounds != 1 || d.Seconds != 0 {
		t.Fatalf("second day %+v, want 2026-10-18, 1 round, 0 s", d)
	}
	// two hours east of UTC the 22:30 round is already on the 18th
	days, _ = m.PracticeDays(u, "en", 2*time.Hour)
	if len(days) != 2 || days[0].Rounds != 1 || days[1].Date != "2026-10-18" || days[1].Rounds != 2 {
		t.Fatalf("UTC+2: %+v, want 1 round on the 17th and 2 on the 18th", days)
	}
	m.Reset(u, "en")
	if days, _ := m.PracticeDays(u, "en", 0); len(days) != 0 {
		t.Fatalf("after reset: %v, want none", days)
	}
}

// BestRounds keeps the fastest round of every length (the first of equal
// ones), learning and free practice apart, without raw keys.
func testBestRounds(t *testing.T, m Store) {
	if b, err := m.BestRounds(u, "en"); err != nil || len(b) != 0 {
		t.Fatalf("no history: %v, %v; want none", b, err)
	}
	keys := []engine.Sample{{Char: "e", Ms: 100}}
	m.AddSession(u, "en", Session{WPM: 40, Accuracy: 90, Length: "words-10"})
	m.AddSession(u, "en", Session{WPM: 55, Accuracy: 97, Length: "words-10", Keys: keys})
	m.AddSession(u, "en", Session{WPM: 55, Accuracy: 80, Length: "words-10"}) // as fast, later: not it
	m.AddSession(u, "en", Session{WPM: 30, Accuracy: 99, Length: "time-30"})
	m.AddFreeplaySession(u, "en", ModeClimb, Session{WPM: 99, Accuracy: 100, Length: "words-10"}) // free practice apart
	m.AddSession("someone-else", "en", Session{WPM: 99, Length: "words-10"})

	b, _ := m.BestRounds(u, "en")
	if len(b) != 2 || b["words-10"].WPM != 55 || b["words-10"].Accuracy != 97 || b["time-30"].WPM != 30 {
		t.Fatalf("bests %+v, want words-10 55 wpm 97%% and time-30 30 wpm", b)
	}
	if b["words-10"].Keys != nil {
		t.Fatalf("a best round keeps its raw keys: %v", b["words-10"].Keys)
	}
	f, _ := m.BestFreeplayRounds(u, "en", ModeClimb)
	if len(f) != 1 || f["words-10"].WPM != 99 {
		t.Fatalf("free practice bests %+v, want words-10 99 wpm", f)
	}
	m.Reset(u, "en")
	if b, _ := m.BestRounds(u, "en"); len(b) != 0 {
		t.Fatalf("after reset: %v, want none", b)
	}
}
