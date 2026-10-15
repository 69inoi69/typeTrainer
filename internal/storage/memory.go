package storage

import (
	"sync"

	"typingtrainer/internal/engine"
)

// MemoryStore keeps everything in RAM. Data is lost when the server stops.
// The mutex makes it safe when several requests arrive at the same time.
type MemoryStore struct {
	mu    sync.Mutex
	langs map[key]*langData
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
	return &MemoryStore{langs: map[key]*langData{}}
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
