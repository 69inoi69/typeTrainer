package storage

import (
	"strconv"
	"sync"
	"time"

	"typingtrainer/internal/engine"
)

// MemoryStore keeps everything in RAM. Data is lost when the server stops.
// The mutex makes it safe when several requests arrive at the same time.
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
	sessions []Session

	testPassed bool      // free practice opened by the typing test
	freeplay   []Session // the history of free practice, oldest first
}

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
	d.sessions = append(d.sessions, s)
	return nil
}

func (m *MemoryStore) RecentSessions(user, lang string, limit int) ([]Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return newestFirst(m.data(user, lang).sessions, limit), nil
}

// newestFirst copies up to limit sessions, newest first.
func newestFirst(all []Session, limit int) []Session {
	out := []Session{}
	for i := len(all) - 1; i >= 0 && len(out) < limit; i-- {
		out = append(out, all[i])
	}
	return out
}

func (m *MemoryStore) SessionCount(user, lang string) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.data(user, lang).sessions), nil
}

func (m *MemoryStore) TestPassed(user, lang string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.data(user, lang).testPassed, nil
}

func (m *MemoryStore) SetTestPassed(user, lang string, passed bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.data(user, lang).testPassed = passed
	return nil
}

func (m *MemoryStore) AddFreeplaySession(user, lang string, s Session) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	d := m.data(user, lang)
	d.freeplay = append(d.freeplay, s)
	return nil
}

func (m *MemoryStore) RecentFreeplaySessions(user, lang string, limit int) ([]Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return newestFirst(m.data(user, lang).freeplay, limit), nil
}

func (m *MemoryStore) FreeplaySessionCount(user, lang string) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.data(user, lang).freeplay), nil
}

// Reset forgets the user's language; the next call to data() starts it
// from zero.
func (m *MemoryStore) Reset(user, lang string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.langs, key{user, lang})
	return nil
}

// CreateUser gives the new account the id "u1", "u2", ... (a PostgreSQL
// store would use the table's own counter). Ids never clash with LocalUser.
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
