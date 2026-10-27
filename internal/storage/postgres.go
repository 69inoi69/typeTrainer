//go:build !(js && wasm)

package storage

// The PostgreSQL Store.

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

	_ "github.com/jackc/pgx/v5/stdlib"

	"typingtrainer/internal/engine"
)

//go:embed migrations/*.sql
var migrations embed.FS

type PostgresStore struct {
	db *sql.DB
}

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

func (p *PostgresStore) Close() error { return p.db.Close() }

func migrate(db *sql.DB) error {
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
		version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`); err != nil {
		return err
	}
	names, err := fs.Glob(migrations, "migrations/*.sql")
	if err != nil {
		return err
	}
	sort.Strings(names)
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

func (p *PostgresStore) KeyStats(user, lang string) (map[string]engine.KeyStat, error) {
	rows, err := p.db.Query(`SELECT ch, count, mistakes, err_ema, time_ema, timed_count, held
		FROM key_stats WHERE user_id = $1 AND lang = $2`, user, lang)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]engine.KeyStat{}
	for rows.Next() {
		var ch string
		var k engine.KeyStat
		if err := rows.Scan(&ch, &k.Count, &k.Mistakes, &k.ErrEMA, &k.TimeEMA, &k.TimedCount, &k.Held); err != nil {
			return nil, err
		}
		out[ch] = k
	}
	return out, rows.Err()
}

func (p *PostgresStore) SaveKeyStats(user, lang string, stats map[string]engine.KeyStat) error {
	return p.inTx(func(tx *sql.Tx) error { return saveKeyStats(tx, user, lang, stats) })
}

func saveKeyStats(tx *sql.Tx, user, lang string, stats map[string]engine.KeyStat) error {
	if _, err := tx.Exec(`DELETE FROM key_stats WHERE user_id = $1 AND lang = $2`, user, lang); err != nil {
		return err
	}
	for ch, k := range stats {
		if _, err := tx.Exec(`INSERT INTO key_stats
			(user_id, lang, ch, count, mistakes, err_ema, time_ema, timed_count, held)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			user, lang, ch, k.Count, k.Mistakes, k.ErrEMA, k.TimeEMA, k.TimedCount, k.Held); err != nil {
			return err
		}
	}
	return nil
}

func (p *PostgresStore) SaveLearned(user, lang string, l Learned) error {
	return p.inTx(func(tx *sql.Tx) error {
		if l.Stats != nil {
			if err := saveKeyStats(tx, user, lang, l.Stats); err != nil {
				return err
			}
			if _, err := tx.Exec(`INSERT INTO progress (user_id, lang, unlocked, lap) VALUES ($1, $2, $3, $4)
				ON CONFLICT (user_id, lang) DO UPDATE SET unlocked = EXCLUDED.unlocked, lap = EXCLUDED.lap`,
				user, lang, l.Unlocked, l.Lap); err != nil {
				return err
			}
		}
		if l.Session == nil {
			return nil
		}
		return addSession(tx, user, lang, modeLearning, *l.Session)
	})
}

func (p *PostgresStore) Unlocked(user, lang string) (int, error) {
	var n int
	err := p.db.QueryRow(`SELECT unlocked FROM progress WHERE user_id = $1 AND lang = $2`, user, lang).Scan(&n)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil
	}
	return n, err
}

func (p *PostgresStore) SetUnlocked(user, lang string, n int) error {
	_, err := p.db.Exec(`INSERT INTO progress (user_id, lang, unlocked) VALUES ($1, $2, $3)
		ON CONFLICT (user_id, lang) DO UPDATE SET unlocked = EXCLUDED.unlocked`, user, lang, n)
	return err
}

func (p *PostgresStore) Lap(user, lang string) (int, error) {
	var n int
	err := p.db.QueryRow(`SELECT lap FROM progress WHERE user_id = $1 AND lang = $2`, user, lang).Scan(&n)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil
	}
	return n, err
}

func (p *PostgresStore) SetLap(user, lang string, n int) error {
	_, err := p.db.Exec(`INSERT INTO progress (user_id, lang, lap) VALUES ($1, $2, $3)
		ON CONFLICT (user_id, lang) DO UPDATE SET lap = EXCLUDED.lap`, user, lang, n)
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

const modeLearning = "learning"

type execer interface {
	Exec(query string, args ...any) (sql.Result, error)
}

func (p *PostgresStore) addSession(user, lang, mode string, s Session) error {
	return addSession(p.db, user, lang, mode, s)
}

func addSession(db execer, user, lang, mode string, s Session) error {
	var keys []byte
	if len(s.Keys) > 0 {
		var err error
		if keys, err = json.Marshal(s.Keys); err != nil {
			return err
		}
	}
	s = s.WithLength()
	_, err := db.Exec(`INSERT INTO sessions
		(user_id, lang, mode, wpm, accuracy, chars, consistency, unlocked, keys, finished_at, length, study_group, device, level, lap, round_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NULLIF($16, ''))
		ON CONFLICT DO NOTHING`,
		user, lang, mode, s.WPM, s.Accuracy, s.Chars, s.Consistency, s.Unlocked, keys, s.FinishedAt, s.Length, s.Group, s.Device, s.Level, s.Lap, s.Round)
	return err
}

func (p *PostgresStore) HasRound(user, lang, round string) (bool, error) {
	if round == "" {
		return false, nil
	}
	var found bool
	err := p.db.QueryRow(`SELECT EXISTS (SELECT 1 FROM sessions WHERE user_id = $1 AND lang = $2 AND round_id = $3)`,
		user, lang, round).Scan(&found)
	return found, err
}

func (p *PostgresStore) recentSessions(user, lang, mode, length string, limit int) ([]Session, error) {
	rows, err := p.db.Query(`SELECT wpm, accuracy, chars, consistency, unlocked, keys, finished_at, length, study_group, device, level, lap
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
		if err := rows.Scan(&s.WPM, &s.Accuracy, &s.Chars, &consistency, &s.Unlocked, &keys, &s.FinishedAt, &s.Length, &s.Group, &s.Device, &s.Level, &s.Lap); err != nil {
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

func (p *PostgresStore) bestRounds(user, lang, mode string) (map[string]Session, error) {
	rows, err := p.db.Query(`SELECT DISTINCT ON (length) wpm, accuracy, chars, consistency, unlocked, finished_at, length, study_group, device, level, lap
		FROM sessions WHERE user_id = $1 AND lang = $2 AND mode = $3
		ORDER BY length, wpm DESC, id`, user, lang, mode)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]Session{}
	for rows.Next() {
		var s Session
		var consistency sql.NullFloat64
		if err := rows.Scan(&s.WPM, &s.Accuracy, &s.Chars, &consistency, &s.Unlocked, &s.FinishedAt, &s.Length, &s.Group, &s.Device, &s.Level, &s.Lap); err != nil {
			return nil, err
		}
		if consistency.Valid {
			s.Consistency = &consistency.Float64
		}
		out[s.Length] = s
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
func (p *PostgresStore) BestRounds(user, lang string) (map[string]Session, error) {
	return p.bestRounds(user, lang, modeLearning)
}
func (p *PostgresStore) LettersTyped(user, lang string, unlocked int) (int, error) {
	var n int
	err := p.db.QueryRow(`SELECT COALESCE(SUM(chars), 0) FROM sessions
		WHERE user_id = $1 AND lang = $2 AND mode = $3 AND unlocked >= $4`,
		user, lang, modeLearning, unlocked).Scan(&n)
	return n, err
}

func (p *PostgresStore) PracticeDays(user, lang string, tz time.Duration) ([]Day, error) {
	rows, err := p.db.Query(`SELECT to_char((finished_at AT TIME ZONE 'UTC') + make_interval(secs => $3), 'YYYY-MM-DD') AS d,
		COUNT(*), COALESCE(SUM(CASE WHEN wpm > 0 THEN chars * accuracy / 100 / 5 / wpm * 60 ELSE 0 END), 0), COALESCE(SUM(chars), 0)
		FROM sessions WHERE user_id = $1 AND lang = $2 GROUP BY d ORDER BY d`,
		user, lang, tz.Seconds())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Day{}
	for rows.Next() {
		var d Day
		if err := rows.Scan(&d.Date, &d.Rounds, &d.Seconds, &d.Chars); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (p *PostgresStore) AddFreeplaySession(user, lang, mode string, s Session) error {
	return p.addSession(user, lang, mode, s)
}
func (p *PostgresStore) RecentFreeplaySessions(user, lang, mode, length string, limit int) ([]Session, error) {
	return p.recentSessions(user, lang, mode, length, limit)
}
func (p *PostgresStore) BestFreeplayRounds(user, lang, mode string) (map[string]Session, error) {
	return p.bestRounds(user, lang, mode)
}
func (p *PostgresStore) FreeplaySessionCount(user, lang, mode, length string) (int, error) {
	return p.sessionCount(user, lang, mode, length)
}
func (p *PostgresStore) FreeplaySessionLengths(user, lang, mode string) ([]string, error) {
	return p.sessionLengths(user, lang, mode)
}

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

func userID(n int64) string { return "u" + strconv.FormatInt(n, 10) }

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
