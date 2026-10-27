//go:build !(js && wasm)

package storage

import (
	"math"
	"os"
	"testing"

	"typingtrainer/internal/engine"
)

func TestPostgresStore(t *testing.T) {
	url := os.Getenv("TT_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TT_TEST_DATABASE_URL not set: no test database")
	}
	p, err := OpenPostgres(url)
	if err != nil {
		t.Fatal(err)
	}
	defer p.Close()
	runStoreTests(t, func(t *testing.T) Store {
		if _, err := p.db.Exec(`TRUNCATE users, logins, progress, key_stats, sessions RESTART IDENTITY`); err != nil {
			t.Fatal(err)
		}
		return p
	})
	again, err := OpenPostgres(url)
	if err != nil {
		t.Fatalf("second open: %v", err)
	}
	again.Close()
}

func TestPostgresSaveLearnedAllOrNothing(t *testing.T) {
	url := os.Getenv("TT_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TT_TEST_DATABASE_URL not set: no test database")
	}
	p, err := OpenPostgres(url)
	if err != nil {
		t.Fatal(err)
	}
	defer p.Close()
	if _, err := p.db.Exec(`TRUNCATE users, logins, progress, key_stats, sessions RESTART IDENTITY`); err != nil {
		t.Fatal(err)
	}
	p.SaveKeyStats(u, "en", map[string]engine.KeyStat{"a": {Count: 1}})
	p.SetUnlocked(u, "en", 6)
	bad := Session{WPM: 40, Chars: math.MaxInt32 + 1, Round: "r1"}
	err = p.SaveLearned(u, "en", Learned{Stats: map[string]engine.KeyStat{"a": {Count: 2}}, Unlocked: 7, Lap: 1, Session: &bad})
	if err == nil {
		t.Fatal("a round that does not fit was stored")
	}
	stats, _ := p.KeyStats(u, "en")
	unlocked, _ := p.Unlocked(u, "en")
	lap, _ := p.Lap(u, "en")
	n, _ := p.SessionCount(u, "en", "")
	if stats["a"].Count != 1 || unlocked != 6 || lap != 0 || n != 0 {
		t.Fatalf("half stored: stats %v, unlocked %d, lap %d, %d rounds", stats, unlocked, lap, n)
	}
}
