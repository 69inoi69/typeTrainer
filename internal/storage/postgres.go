//go:build !(js && wasm)

package storage

// PostgresStore keeps everything in a PostgreSQL database, so nothing is
// lost when the server stops. It implements the same Store interface as
// MemoryStore, and the same tests run against both (store_test.go).
//
// The code uses only the standard database/sql package. The one
// third-party module of the project, the pgx driver, is only registered
// below (import _ ".../stdlib"): it teaches database/sql to talk to
// PostgreSQL. Not in the WebAssembly build (no database in a browser).

import (
	"database/sql"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"sort"
	"strconv"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib" // registers the "pgx" driver for database/sql

	"typingtrainer/internal/engine"
)

//go:embed migrations/*.sql
var migrations embed.FS

// PostgresStore is the Store kept in PostgreSQL (see the top of this file).
// Its methods do what the Store interface (store.go) says; only the ones
// with something surprising have their own comment. A *sql.DB is safe for
// many requests at once: it keeps a pool of connections by itself.
type PostgresStore struct {
	db *sql.DB
}

// OpenPostgres connects to the database at url, for example
// postgres://user:password@localhost:5432/typetrainer, checks the
// connection and brings the tables up to date (migrate).
func OpenPostgres(url string) (*PostgresStore, error) {
	db, err := sql.Open("pgx", url)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("cannot reach the database: %w", err)
	}
	if err := migrate(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrations: %w", err)
	}
	return &PostgresStore{db: db}, nil
}

// Close ends the connections (used by the tests).
func (p *PostgresStore) Close() error { return p.db.Close() }

// migrate applies the files in migrations/ that this database has not seen
// yet, in the order of their numbers, each in its own transaction. The
// table schema_migrations remembers which ones ran. So a new version of the
// app updates an old database by itself, and running it twice changes
// nothing. This is also why an old migration file must never be edited:
// a database that already ran it would never see the change.
func migrate(db *sql.DB) error {
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
		version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`); err != nil {
		return err
	}
	names, err := fs.Glob(migrations, "migrations/*.sql")
	if err != nil {
		return err
	}
	sort.Strings(names) // 001_..., 002_...: the number decides the order
	for _, name := range names {
		version, err := strconv.Atoi(strings.SplitN(strings.TrimPrefix(name, "migrations/"), "_", 2)[0])
		if err != nil {
			return fmt.Errorf("%s: the file name must start with a number", name)
		}
		var done bool
		if err := db.QueryRow(`SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)`, version).Scan(&done); err != nil {
			return err
		}
		if done {
			continue
		}
		body, err := migrations.ReadFile(name)
		if err != nil {
			return err
		}
		tx, err := db.Begin()
		if err != nil {
			return err
		}
		if _, err := tx.Exec(string(body)); err != nil {
			tx.Rollback()
			return fmt.Errorf("%s: %w", name, err)
		}
		if _, err := tx.Exec(`INSERT INTO schema_migrations (version) VALUES ($1)`, version); err != nil {
			tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

// inTx runs f in a transaction: everything in it is saved, or nothing.
func (p *PostgresStore) inTx(f func(tx *sql.Tx) error) error {
	tx, err := p.db.Begin()
	if err != nil {
		return err
	}
	if err := f(tx); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit()
}

// ---------- letter statistics ----------

func (p *PostgresStore) KeyStats(user, lang string) (map[string]engine.KeyStat, error) {
	rows, err := p.db.Query(`SELECT ch, count, mistakes, err_ema, time_ema, timed_count
		FROM key_stats WHERE user_id = $1 AND lang = $2`, user, lang)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]engine.KeyStat{}
	for rows.Next() {
		var ch string
		var k engine.KeyStat
		if err := rows.Scan(&ch, &k.Count, &k.Mistakes, &k.ErrEMA, &k.TimeEMA, &k.TimedCount); err != nil {
			return nil, err
		}
		out[ch] = k
	}
	return out, rows.Err()
}

// SaveKeyStats replaces the whole set for the language, like MemoryStore.
func (p *PostgresStore) SaveKeyStats(user, lang string, stats map[string]engine.KeyStat) error {
	return p.inTx(func(tx *sql.Tx) error {
		if _, err := tx.Exec(`DELETE FROM key_stats WHERE user_id = $1 AND lang = $2`, user, lang); err != nil {
			return err
		}
		for ch, k := range stats {
			if _, err := tx.Exec(`INSERT INTO key_stats
				(user_id, lang, ch, count, mistakes, err_ema, time_ema, timed_count)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
				user, lang, ch, k.Count, k.Mistakes, k.ErrEMA, k.TimeEMA, k.TimedCount); err != nil {
				return err
			}
		}
		return nil
	})
}

// ---------- progress: unlocked letters and the typing test ----------

func (p *PostgresStore) Unlocked(user, lang string) (int, error) {
	var n int
	err := p.db.QueryRow(`SELECT unlocked FROM progress WHERE user_id = $1 AND lang = $2`, user, lang).Scan(&n)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil // a new user or language
	}
	return n, err
}

// SetUnlocked: "upsert", insert the row or update it if it exists.
func (p *PostgresStore) SetUnlocked(user, lang string, n int) error {
	_, err := p.db.Exec(`INSERT INTO progress (user_id, lang, unlocked) VALUES ($1, $2, $3)
		ON CONFLICT (user_id, lang) DO UPDATE SET unlocked = EXCLUDED.unlocked`, user, lang, n)
	return err
}

func (p *PostgresStore) Group(user, lang string) (string, error) {
	var g string
	err := p.db.QueryRow(`SELECT study_group FROM progress WHERE user_id = $1 AND lang = $2`, user, lang).Scan(&g)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return g, err
}

func (p *PostgresStore) SetGroup(user, lang, group string) error {
	_, err := p.db.Exec(`INSERT INTO progress (user_id, lang, study_group) VALUES ($1, $2, $3)
		ON CONFLICT (user_id, lang) DO UPDATE SET study_group = EXCLUDED.study_group`, user, lang, group)
	return err
}

func (p *PostgresStore) TestPassed(user, lang string) (bool, error) {
	var passed bool
	err := p.db.QueryRow(`SELECT test_passed FROM progress WHERE user_id = $1 AND lang = $2`, user, lang).Scan(&passed)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return passed, err
}

func (p *PostgresStore) SetTestPassed(user, lang string, passed bool) error {
	_, err := p.db.Exec(`INSERT INTO progress (user_id, lang, test_passed) VALUES ($1, $2, $3)
		ON CONFLICT (user_id, lang) DO UPDATE SET test_passed = EXCLUDED.test_passed`, user, lang, passed)
	return err
}

// ---------- history (learning and free practice) ----------

// Learning and free practice share the sessions table; the mode column
// keeps the two histories apart (every query below filters on it).
const (
	modeLearning = "learning"
	modeFreeplay = "freeplay"
)

// addSession stores one round in the history of one mode.
func (p *PostgresStore) addSession(user, lang, mode string, s Session) error {
	var keys []byte // nil -> NULL: no raw record
	if len(s.Keys) > 0 {
		var err error
		if keys, err = json.Marshal(s.Keys); err != nil {
			return err
		}
	}
	s = s.WithLength()
	_, err := p.db.Exec(`INSERT INTO sessions
		(user_id, lang, mode, wpm, accuracy, chars, consistency, unlocked, keys, finished_at, length, study_group, device)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
		user, lang, mode, s.WPM, s.Accuracy, s.Chars, s.Consistency, s.Unlocked, keys, s.FinishedAt, s.Length, s.Group, s.Device)
	return err
}

// recentSessions reads up to limit rounds of one mode, newest first (by id,
// the order they were stored in). In this query and the two below, an empty
// length means "every length".
func (p *PostgresStore) recentSessions(user, lang, mode, length string, limit int) ([]Session, error) {
	rows, err := p.db.Query(`SELECT wpm, accuracy, chars, consistency, unlocked, keys, finished_at, length, study_group, device
		FROM sessions WHERE user_id = $1 AND lang = $2 AND mode = $3 AND ($4 = '' OR length = $4)
		ORDER BY id DESC LIMIT $5`, user, lang, mode, length, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Session{}
	for rows.Next() {
		var s Session
		var consistency sql.NullFloat64
		var keys []byte
		if err := rows.Scan(&s.WPM, &s.Accuracy, &s.Chars, &consistency, &s.Unlocked, &keys, &s.FinishedAt, &s.Length, &s.Group, &s.Device); err != nil {
			return nil, err
		}
		if consistency.Valid {
			s.Consistency = &consistency.Float64
		}
		if keys != nil {
			if err := json.Unmarshal(keys, &s.Keys); err != nil {
				return nil, err
			}
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (p *PostgresStore) sessionCount(user, lang, mode, length string) (int, error) {
	var n int
	err := p.db.QueryRow(`SELECT count(*) FROM sessions
		WHERE user_id = $1 AND lang = $2 AND mode = $3 AND ($4 = '' OR length = $4)`,
		user, lang, mode, length).Scan(&n)
	return n, err
}

func (p *PostgresStore) sessionLengths(user, lang, mode string) ([]string, error) {
	rows, err := p.db.Query(`SELECT DISTINCT length FROM sessions
		WHERE user_id = $1 AND lang = $2 AND mode = $3 ORDER BY length`, user, lang, mode)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var l string
		if err := rows.Scan(&l); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (p *PostgresStore) AddSession(user, lang string, s Session) error {
	return p.addSession(user, lang, modeLearning, s)
}
func (p *PostgresStore) RecentSessions(user, lang, length string, limit int) ([]Session, error) {
	return p.recentSessions(user, lang, modeLearning, length, limit)
}
func (p *PostgresStore) SessionCount(user, lang, length string) (int, error) {
	return p.sessionCount(user, lang, modeLearning, length)
}
func (p *PostgresStore) SessionLengths(user, lang string) ([]string, error) {
	return p.sessionLengths(user, lang, modeLearning)
}
func (p *PostgresStore) LettersTyped(user, lang string, unlocked int) (int, error) {
	var n int
	err := p.db.QueryRow(`SELECT COALESCE(SUM(chars), 0) FROM sessions
		WHERE user_id = $1 AND lang = $2 AND mode = $3 AND unlocked >= $4`,
		user, lang, modeLearning, unlocked).Scan(&n)
	return n, err
}
func (p *PostgresStore) AddFreeplaySession(user, lang string, s Session) error {
	return p.addSession(user, lang, modeFreeplay, s)
}
func (p *PostgresStore) RecentFreeplaySessions(user, lang, length string, limit int) ([]Session, error) {
	return p.recentSessions(user, lang, modeFreeplay, length, limit)
}
func (p *PostgresStore) FreeplaySessionCount(user, lang, length string) (int, error) {
	return p.sessionCount(user, lang, modeFreeplay, length)
}
func (p *PostgresStore) FreeplaySessionLengths(user, lang string) ([]string, error) {
	return p.sessionLengths(user, lang, modeFreeplay)
}

// Reset deletes the user's language from all three tables in one transaction.
// The table names are fixed strings, never user input. Accounts and logins
// are not per language, so they stay.
func (p *PostgresStore) Reset(user, lang string) error {
	return p.inTx(func(tx *sql.Tx) error {
		for _, table := range []string{"progress", "key_stats", "sessions"} {
			if _, err := tx.Exec(`DELETE FROM `+table+` WHERE user_id = $1 AND lang = $2`, user, lang); err != nil {
				return err
			}
		}
		return nil
	})
}

// ---------- accounts ----------

// userID turns the table's number into the id the rest of the app uses.
func userID(n int64) string { return "u" + strconv.FormatInt(n, 10) }

// CreateUser: ON CONFLICT DO NOTHING inserts no row for a taken name, so
// RETURNING gives nothing and Scan reports sql.ErrNoRows.
func (p *PostgresStore) CreateUser(name, passwordHash string, now time.Time) (User, error) {
	var n int64
	err := p.db.QueryRow(`INSERT INTO users (name, password_hash, created_at) VALUES ($1, $2, $3)
		ON CONFLICT (name) DO NOTHING RETURNING id`, name, passwordHash, now).Scan(&n)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, ErrNameTaken
	}
	if err != nil {
		return User{}, err
	}
	return User{ID: userID(n), Name: name, PasswordHash: passwordHash, CreatedAt: now}, nil
}

// user reads one account. where is always a fixed string from this file,
// never user input, so building the query with + is safe; the value itself
// goes in as $1.
func (p *PostgresStore) user(where string, arg any) (User, error) {
	var u User
	var n int64
	err := p.db.QueryRow(`SELECT id, name, password_hash, created_at FROM users WHERE `+where, arg).
		Scan(&n, &u.Name, &u.PasswordHash, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, ErrNotFound
	}
	u.ID = userID(n)
	return u, err
}

func (p *PostgresStore) UserByName(name string) (User, error) {
	return p.user("name = $1", name)
}

// UserByID: a guest ("local", "g...") or anything else that is not
// "u<number>" is no account.
func (p *PostgresStore) UserByID(id string) (User, error) {
	n, err := strconv.ParseInt(strings.TrimPrefix(id, "u"), 10, 64)
	if err != nil || !strings.HasPrefix(id, "u") {
		return User{}, ErrNotFound
	}
	return p.user("id = $1", n)
}

func (p *PostgresStore) AddLogin(tokenHash, userID string, expires time.Time) error {
	_, err := p.db.Exec(`INSERT INTO logins (token_hash, user_id, expires) VALUES ($1, $2, $3)`,
		tokenHash, userID, expires)
	return err
}

// LoginUser forgets an expired login when it sees one, like MemoryStore.
func (p *PostgresStore) LoginUser(tokenHash string, now time.Time) (string, error) {
	var id string
	var expires time.Time
	err := p.db.QueryRow(`SELECT user_id, expires FROM logins WHERE token_hash = $1`, tokenHash).Scan(&id, &expires)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", err
	}
	if !now.Before(expires) {
		if err := p.DeleteLogin(tokenHash); err != nil {
			return "", err
		}
		return "", ErrNotFound
	}
	return id, nil
}

func (p *PostgresStore) DeleteLogin(tokenHash string) error {
	_, err := p.db.Exec(`DELETE FROM logins WHERE token_hash = $1`, tokenHash)
	return err
}
