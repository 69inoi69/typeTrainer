package storage

// Tests every Store implementation must pass.

import (
	"errors"
	"fmt"
	"math"
	"testing"
	"time"

	"typingtrainer/internal/engine"
)

const u = LocalUser

var storeTests = map[string]func(*testing.T, Store){
	"LanguagesAreSeparate":      testLanguagesAreSeparate,
	"KeyStatsIsACopy":           testKeyStatsIsACopy,
	"RecentSessionsNewestFirst": testRecentSessionsNewestFirst,
	"Reset":                     testReset,
	"Freeplay":                  testFreeplay,
	"FreetypeModes":             testFreetypeModes,
	"UsersAreSeparate":          testUsersAreSeparate,
	"Users":                     testUsers,
	"SignUpTakesGuest":          testSignUpTakesGuest,
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
	"RoundSentTwice":            testRoundSentTwice,
	"SaveLearned":               testSaveLearned,
}

func testRoundSentTwice(t *testing.T, m Store) {
	if has, err := m.HasRound(u, "en", "r1"); err != nil || has {
		t.Fatalf("empty store: HasRound = %v, %v", has, err)
	}
	for range 2 {
		if err := m.AddSession(u, "en", Session{WPM: 40, Round: "r1"}); err != nil {
			t.Fatal(err)
		}
	}
	if n, _ := m.SessionCount(u, "en", ""); n != 1 {
		t.Fatalf("learning round sent twice: %d rounds, want 1", n)
	}
	m.AddFreeplaySession(u, "en", ModeClimb, Session{WPM: 50, Level: 1, Round: "r1"})
	m.AddFreeplaySession(u, "en", ModeClimb, Session{WPM: 50, Level: 1, Round: "r2"})
	m.AddFreeplaySession(u, "en", ModeClimb, Session{WPM: 50, Level: 1, Round: "r2"})
	if n, _ := m.FreeplaySessionCount(u, "en", ModeClimb, ""); n != 1 {
		t.Fatalf("Climb: %d rounds, want 1 (r1 is taken, r2 once)", n)
	}
	if has, _ := m.HasRound(u, "en", "r2"); !has {
		t.Fatal("HasRound(r2) = false after it was saved")
	}
	if has, _ := m.HasRound(u, "pl", "r1"); has {
		t.Fatal("the id leaked into another language")
	}
	if has, _ := m.HasRound("someone-else", "en", "r1"); has {
		t.Fatal("the id leaked to another user")
	}
	m.AddSession(u, "en", Session{WPM: 30})
	m.AddSession(u, "en", Session{WPM: 30})
	if n, _ := m.SessionCount(u, "en", ""); n != 3 {
		t.Fatalf("rounds without an id: %d rounds, want 3", n)
	}
	if has, _ := m.HasRound(u, "en", ""); has {
		t.Fatal(`HasRound("") must be false`)
	}
}

func testSaveLearned(t *testing.T, m Store) {
	m.SetGroup(u, "en", GroupRandom)
	stats := map[string]engine.KeyStat{"a": {Count: 3}, "s": {Count: 1}}
	round := Session{WPM: 40, Chars: 2, Round: "r1"}
	if err := m.SaveLearned(u, "en", Learned{Stats: stats, Unlocked: 7, Lap: 1, Session: &round}); err != nil {
		t.Fatal(err)
	}
	stats["a"] = engine.KeyStat{Count: 99}
	check := func(when string, rounds int) {
		t.Helper()
		got, _ := m.KeyStats(u, "en")
		unlocked, _ := m.Unlocked(u, "en")
		lap, _ := m.Lap(u, "en")
		n, _ := m.SessionCount(u, "en", "")
		if len(got) != 2 || got["a"].Count != 3 || unlocked != 7 || lap != 1 || n != rounds {
			t.Fatalf("%s: stats %v, unlocked %d, lap %d, %d rounds", when, got, unlocked, lap, n)
		}
	}
	check("after the round", 1)
	if err := m.SaveLearned(u, "en", Learned{Unlocked: 1, Session: &round}); err != nil {
		t.Fatal(err)
	}
	check("round sent again", 1)
	m.SaveLearned(u, "en", Learned{Unlocked: 1})
	check("empty portion", 1)
	if g, _ := m.Group(u, "en"); g != GroupRandom {
		t.Fatalf("group = %q, want it kept", g)
	}
	m.SaveLearned(u, "en", Learned{Stats: map[string]engine.KeyStat{"a": {Count: 4}}, Unlocked: 8, Lap: 1})
	if got, _ := m.KeyStats(u, "en"); len(got) != 1 || got["a"].Count != 4 {
		t.Fatalf("portion: stats %v", got)
	}
	if n, _ := m.Unlocked(u, "en"); n != 8 {
		t.Fatalf("portion: unlocked %d, want 8", n)
	}
	if n, _ := m.SessionCount(u, "en", ""); n != 1 {
		t.Fatalf("portion added a round: %d", n)
	}
}

func runStoreTests(t *testing.T, newStore func(t *testing.T) Store) {
	for name, test := range storeTests {
		t.Run(name, func(t *testing.T) { test(t, newStore(t)) })
	}
}

func TestMemoryStore(t *testing.T) {
	runStoreTests(t, func(*testing.T) Store { return NewMemoryStore() })
}

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
	got, _ := m.RecentSessions(u, "pl", "", 2)
	if len(got) != 2 || got[0].WPM != 30 || got[1].WPM != 20 {
		t.Fatalf("got %+v", got)
	}
}

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
	if err := m.Reset(u, "uk"); err != nil {
		t.Fatal(err)
	}
}

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

func testFreetypeModes(t *testing.T, m Store) {
	small, big := FreetypeMode(200, ""), FreetypeMode(25000, "")
	if small != "freetype-200" {
		t.Fatalf("FreetypeMode(200) = %q", small)
	}
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
	a, err := m.CreateUser("ann", "hash-a", now, "")
	if err != nil || a.ID == "" || a.ID == LocalUser {
		t.Fatalf("create: %+v %v", a, err)
	}
	if _, err := m.CreateUser("ann", "other", now, ""); !errors.Is(err, ErrNameTaken) {
		t.Fatalf("second ann: %v, want ErrNameTaken", err)
	}
	b, _ := m.CreateUser("bob", "hash-b", now, "")
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

func testSignUpTakesGuest(t *testing.T, m Store) {
	const guest, other = GuestPrefix + "1", GuestPrefix + "2"
	m.SaveKeyStats(guest, "en", map[string]engine.KeyStat{"e": {Count: 5}})
	m.SetUnlocked(guest, "en", 9)
	m.SetLap(guest, "en", 2)
	m.AddSession(guest, "en", Session{WPM: 40})
	m.AddFreeplaySession(guest, "en", ModeClimb, Session{WPM: 50, Level: 3})
	m.AddFreeplaySession(guest, "en", FreetypeMode(200, ""), Session{WPM: 60})
	m.AddSession(guest, "uk", Session{WPM: 30})
	m.AddSession(other, "en", Session{WPM: 20})

	a, err := m.CreateUser("ann", "hash", time.Now(), guest)
	if err != nil {
		t.Fatal(err)
	}
	stats, _ := m.KeyStats(a.ID, "en")
	unlocked, _ := m.Unlocked(a.ID, "en")
	lap, _ := m.Lap(a.ID, "en")
	learn, _ := m.SessionCount(a.ID, "en", "")
	climb, _ := m.FreeplaySessionCount(a.ID, "en", ModeClimb, "")
	free, _ := m.FreeplaySessionCount(a.ID, "en", FreetypeMode(200, ""), "")
	uk, _ := m.SessionCount(a.ID, "uk", "")
	if stats["e"].Count != 5 || unlocked != 9 || lap != 2 || learn != 1 || climb != 1 || free != 1 || uk != 1 {
		t.Fatalf("account: stats=%v unlocked=%d lap=%d learn=%d climb=%d freetype=%d uk=%d", stats, unlocked, lap, learn, climb, free, uk)
	}
	left, _ := m.SessionCount(guest, "en", "")
	leftStats, _ := m.KeyStats(guest, "en")
	if left != 0 || len(leftStats) != 0 {
		t.Fatalf("the guest kept a copy: rounds=%d stats=%v", left, leftStats)
	}
	if n, _ := m.SessionCount(other, "en", ""); n != 1 {
		t.Fatal("another guest's rounds moved too")
	}

	b, _ := m.CreateUser("bob", "hash", time.Now(), guest)
	if n, _ := m.SessionCount(b.ID, "en", ""); n != 0 {
		t.Fatal("an empty guest gave the next account rounds")
	}
	if _, err := m.CreateUser("ann", "hash", time.Now(), other); !errors.Is(err, ErrNameTaken) {
		t.Fatalf("taken name: %v", err)
	}
	if n, _ := m.SessionCount(other, "en", ""); n != 1 {
		t.Fatal("a failed sign up moved the guest's rounds")
	}
}

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

func testSessionFields(t *testing.T, m Store) {
	c := 81.5
	when := time.Date(2026, 10, 15, 18, 30, 0, 0, time.UTC)
	in := Session{WPM: 42.5, Accuracy: 97.25, Chars: 180, Consistency: &c, FinishedAt: when,
		Keys: []engine.Sample{{Char: "ж", Errors: 1, Ms: 0}, {Char: " ", Errors: 0, Ms: 183}}, Unlocked: 7}
	m.AddSession(u, "ru", in)
	m.AddSession(u, "ru", Session{WPM: 10, FinishedAt: when})
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

func testLengths(t *testing.T, m Store) {
	m.AddSession(u, "en", Session{WPM: 30})
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

func testLettersTyped(t *testing.T, m Store) {
	if n, err := m.LettersTyped(u, "en", 26); err != nil || n != 0 {
		t.Fatalf("no history: %d, %v; want 0", n, err)
	}
	m.AddSession(u, "en", Session{Chars: 100, Unlocked: 20})
	m.AddSession(u, "en", Session{Chars: 150, Unlocked: 26})
	m.AddSession(u, "en", Session{Chars: 50, Unlocked: 26})
	m.AddSession(u, "pl", Session{Chars: 999, Unlocked: 32})
	m.AddSession("someone-else", "en", Session{Chars: 999, Unlocked: 26})
	m.AddFreeplaySession(u, "en", ModeClimb, Session{Chars: 999})
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
	m.SetUnlocked(u, "en", 7)
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

func testPracticeDays(t *testing.T, m Store) {
	if days, err := m.PracticeDays(u, "en", 0); err != nil || len(days) != 0 {
		t.Fatalf("no history: %v, %v; want none", days, err)
	}
	at := func(s string) time.Time { v, _ := time.Parse(time.RFC3339, s); return v }
	m.AddSession(u, "en", Session{WPM: 60, Accuracy: 100, Chars: 300, FinishedAt: at("2026-10-17T10:00:00Z")})
	m.AddFreeplaySession(u, "en", ModeClimb, Session{WPM: 30, Accuracy: 100, Chars: 150, FinishedAt: at("2026-10-17T22:30:00Z")})
	m.AddSession(u, "en", Session{WPM: 0, Accuracy: 0, Chars: 0, FinishedAt: at("2026-10-18T09:00:00Z")})
	m.AddSession(u, "pl", Session{WPM: 60, Accuracy: 100, Chars: 300, FinishedAt: at("2026-10-17T10:00:00Z")})
	m.AddSession("someone-else", "en", Session{WPM: 60, Accuracy: 100, Chars: 300, FinishedAt: at("2026-10-17T10:00:00Z")})

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
	days, _ = m.PracticeDays(u, "en", 2*time.Hour)
	if len(days) != 2 || days[0].Rounds != 1 || days[1].Date != "2026-10-18" || days[1].Rounds != 2 {
		t.Fatalf("UTC+2: %+v, want 1 round on the 17th and 2 on the 18th", days)
	}
	m.Reset(u, "en")
	if days, _ := m.PracticeDays(u, "en", 0); len(days) != 0 {
		t.Fatalf("after reset: %v, want none", days)
	}
}

func testBestRounds(t *testing.T, m Store) {
	if b, err := m.BestRounds(u, "en"); err != nil || len(b) != 0 {
		t.Fatalf("no history: %v, %v; want none", b, err)
	}
	keys := []engine.Sample{{Char: "e", Ms: 100}}
	m.AddSession(u, "en", Session{WPM: 40, Accuracy: 90, Length: "words-10"})
	m.AddSession(u, "en", Session{WPM: 55, Accuracy: 97, Length: "words-10", Keys: keys})
	m.AddSession(u, "en", Session{WPM: 55, Accuracy: 80, Length: "words-10"})
	m.AddSession(u, "en", Session{WPM: 30, Accuracy: 99, Length: "time-30"})
	m.AddFreeplaySession(u, "en", ModeClimb, Session{WPM: 99, Accuracy: 100, Length: "words-10"})
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
