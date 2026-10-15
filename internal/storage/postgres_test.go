//go:build !(js && wasm)

package storage

import (
	"os"
	"testing"
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
