// The in-memory Store: plain Go maps behind one mutex.

package storage

import (
	"sort"
	"strconv"
	"sync"
	"time"

	"typingtrainer/internal/engine"
)

// MemoryStore keeps everything in RAM. Data is lost when the server stops.
// The mutex makes it safe when several requests arrive at the same time:
// the HTTP server runs every request in its own goroutine, and Go maps must
// not be read and written at once. One lock for everything is simple, and
// fast enough here (every operation is a few map lookups).
//
// Its methods do what the Store interface (store.go) says; only the ones
// with something surprising have their own comment.
type MemoryStore struct {
	mu    sync.Mutex
	langs map[key]*langData

	users  map[string]User   // by name
	names  map[string]string // user id -> name
	logins map[string]login  // by token hash
}

// login is one logged-in browser: whose it is and until when.
type login struct {
	userID  string
	expires time.Time
}

// key says whose data it is and in which language.
type key struct{ user, lang string }

// langData is everything one user has stored for one language.
type langData struct {
	stats    map[string]engine.KeyStat
	unlocked int
	group    string // study group ("" or GroupRandom)
	sessions []Session

	freeplay []Session // the history of Climb, oldest first
}

// NewMemoryStore returns an empty store.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{langs: map[key]*langData{}, users: map[string]User{}, names: map[string]string{}, logins: map[string]login{}}
}

// data returns the record of a user in a language, creating it on first
// use. The caller must hold m.mu.
func (m *MemoryStore) data(user, lang string) *langData {
	k := key{user, lang}
	d, ok := m.langs[k]
	if !ok {
		d = &langData{stats: map[string]engine.KeyStat{}}
		m.langs[k] = d
	}
	return d
}

// KeyStats returns a COPY, so callers cannot change our data by accident.
func (m *MemoryStore) KeyStats(user, lang string) (map[string]engine.KeyStat, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	src := m.data(user, lang).stats
	out := make(map[string]engine.KeyStat, len(src))
	for k, v := range src {
		out[k] = v
	}
	return out, nil
}

// SaveKeyStats keeps a copy too, for the same reason as KeyStats.
func (m *MemoryStore) SaveKeyStats(user, lang string, stats map[string]engine.KeyStat) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	d := m.data(user, lang)
	d.stats = make(map[string]engine.KeyStat, len(stats))
	for k, v := range stats {
		d.stats[k] = v
	}
	return nil
}

func (m *MemoryStore) Unlocked(user, lang string) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.data(user, lang).unlocked, nil
}

func (m *MemoryStore) SetUnlocked(user, lang string, n int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.data(user, lang).unlocked = n
	return nil
}

func (m *MemoryStore) AddSession(user, lang string, s Session) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	d := m.data(user, lang)
	d.sessions = append(d.sessions, s.WithLength())
	return nil
}

func (m *MemoryStore) RecentSessions(user, lang, length string, limit int) ([]Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return newestFirst(m.data(user, lang).sessions, length, limit), nil
}

// newestFirst copies up to limit sessions of one length ("" = any),
// newest first.
func newestFirst(all []Session, length string, limit int) []Session {
	out := []Session{}
	for i := len(all) - 1; i >= 0 && len(out) < limit; i-- {
		if length == "" || all[i].Length == length {
			out = append(out, all[i])
		}
	}
	return out
}

// countLength counts the sessions of one length ("" = all).
func countLength(all []Session, length string) int {
	if length == "" {
		return len(all)
	}
	n := 0
	for _, s := range all {
		if s.Length == length {
			n++
		}
	}
	return n
}

// lengths lists the different lengths of the sessions, sorted.
func lengths(all []Session) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, s := range all {
		if !seen[s.Length] {
			seen[s.Length] = true
			out = append(out, s.Length)
		}
	}
	sort.Strings(out)
	return out
}

func (m *MemoryStore) SessionCount(user, lang, length string) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return countLength(m.data(user, lang).sessions, length), nil
}

func (m *MemoryStore) SessionLengths(user, lang string) ([]string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return lengths(m.data(user, lang).sessions), nil
}

func (m *MemoryStore) BestRounds(user, lang string) (map[string]Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return bestOf(m.data(user, lang).sessions), nil
}

// bestOf keeps the fastest session of every length (the first of equal
// ones), without its raw keys.
func bestOf(all []Session) map[string]Session {
	out := map[string]Session{}
	for _, s := range all {
		if b, ok := out[s.Length]; !ok || s.WPM > b.WPM {
			out[s.Length] = s.Summary()
		}
	}
	return out
}

func (m *MemoryStore) LettersTyped(user, lang string, unlocked int) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := 0
	for _, s := range m.data(user, lang).sessions {
		if s.Unlocked >= unlocked {
			n += s.Chars
		}
	}
	return n, nil
}

func (m *MemoryStore) Group(user, lang string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.data(user, lang).group, nil
}

func (m *MemoryStore) SetGroup(user, lang, group string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.data(user, lang).group = group
	return nil
}

func (m *MemoryStore) PracticeDays(user, lang string, tz time.Duration) ([]Day, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	d := m.data(user, lang)
	byDate := map[string]*Day{}
	for _, s := range append(append([]Session{}, d.sessions...), d.freeplay...) {
		date := s.FinishedAt.UTC().Add(tz).Format("2006-01-02")
		day := byDate[date]
		if day == nil {
			day = &Day{Date: date}
			byDate[date] = day
		}
		day.Rounds++
		day.Seconds += RoundSeconds(s.WPM, s.Accuracy, s.Chars)
		day.Chars += s.Chars
	}
	out := make([]Day, 0, len(byDate))
	for _, day := range byDate {
		out = append(out, *day)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Date < out[j].Date })
	return out, nil
}

func (m *MemoryStore) AddFreeplaySession(user, lang string, s Session) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	d := m.data(user, lang)
	d.freeplay = append(d.freeplay, s.WithLength())
	return nil
}

func (m *MemoryStore) RecentFreeplaySessions(user, lang, length string, limit int) ([]Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return newestFirst(m.data(user, lang).freeplay, length, limit), nil
}

func (m *MemoryStore) BestFreeplayRounds(user, lang string) (map[string]Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return bestOf(m.data(user, lang).freeplay), nil
}

func (m *MemoryStore) FreeplaySessionCount(user, lang, length string) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return countLength(m.data(user, lang).freeplay, length), nil
}

func (m *MemoryStore) FreeplaySessionLengths(user, lang string) ([]string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return lengths(m.data(user, lang).freeplay), nil
}

// Reset forgets the user's language; the next call to data() starts it
// from zero.
func (m *MemoryStore) Reset(user, lang string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.langs, key{user, lang})
	return nil
}

// CreateUser gives the new account the id "u1", "u2", ... (PostgresStore
// uses the table's own counter, with the same "u" in front). Ids never clash
// with guests (LocalUser, GuestPrefix).
func (m *MemoryStore) CreateUser(name, passwordHash string, now time.Time) (User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.users[name]; ok {
		return User{}, ErrNameTaken
	}
	u := User{ID: "u" + strconv.Itoa(len(m.users)+1), Name: name, PasswordHash: passwordHash, CreatedAt: now}
	m.users[name] = u
	m.names[u.ID] = name
	return u, nil
}

func (m *MemoryStore) UserByName(name string) (User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	u, ok := m.users[name]
	if !ok {
		return User{}, ErrNotFound
	}
	return u, nil
}

func (m *MemoryStore) UserByID(id string) (User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	name, ok := m.names[id]
	if !ok {
		return User{}, ErrNotFound
	}
	return m.users[name], nil
}

func (m *MemoryStore) AddLogin(tokenHash, userID string, expires time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.logins[tokenHash] = login{userID: userID, expires: expires}
	return nil
}

// LoginUser forgets an expired login when it sees one.
func (m *MemoryStore) LoginUser(tokenHash string, now time.Time) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	l, ok := m.logins[tokenHash]
	if !ok {
		return "", ErrNotFound
	}
	if !now.Before(l.expires) {
		delete(m.logins, tokenHash)
		return "", ErrNotFound
	}
	return l.userID, nil
}

func (m *MemoryStore) DeleteLogin(tokenHash string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.logins, tokenHash)
	return nil
}
