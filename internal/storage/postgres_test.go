//go:build !(js && wasm)

package storage

import (
	"math"
	"os"
	"testing"

	"typingtrainer/internal/engine"
)

// TestPostgresStore runs every store test (store_test.go) against a real
// PostgreSQL database, if TT_TEST_DATABASE_URL points to one, for example
//
//	postgres://tt:tt@localhost:5432/typetrainer_test
//
// Without it the test is skipped. Every test starts with empty tables, so
// never point it at a database with data you want to keep. The pull
// request checks (.github/workflows/tests.yml) start a database for it.
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
	// opening the same database again finds every migration done
	again, err := OpenPostgres(url)
	if err != nil {
		t.Fatalf("second open: %v", err)
	}
	again.Close()
}

// SaveLearned is one transaction: when the round cannot be stored (here a
// character count too big for its column), the letters and the progress
// stay as they were, so the page can send the round again.
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
