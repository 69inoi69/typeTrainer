package storage

import (
	"sync"

	"typingtrainer/internal/engine"
)

// MemoryStore keeps everything in RAM. Data is lost when the server stops.
// The mutex makes it safe when several requests arrive at the same time.
type MemoryStore struct {
	mu    sync.Mutex
	langs map[string]*langData
}

// langData is everything stored for one language.
type langData struct {
	stats    map[string]engine.KeyStat
	unlocked int
	sessions []Session
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{langs: map[string]*langData{}}
}

// data returns the record for a language, creating it on first use.
// The caller must hold m.mu.
func (m *MemoryStore) data(lang string) *langData {
	d, ok := m.langs[lang]
	if !ok {
		d = &langData{stats: map[string]engine.KeyStat{}}
		m.langs[lang] = d
	}
	return d
}

// KeyStats returns a COPY, so callers cannot change our data by accident.
func (m *MemoryStore) KeyStats(lang string) (map[string]engine.KeyStat, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	src := m.data(lang).stats
	out := make(map[string]engine.KeyStat, len(src))
	for k, v := range src {
		out[k] = v
	}
	return out, nil
}

func (m *MemoryStore) SaveKeyStats(lang string, stats map[string]engine.KeyStat) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	d := m.data(lang)
	d.stats = make(map[string]engine.KeyStat, len(stats))
	for k, v := range stats {
		d.stats[k] = v
	}
	return nil
}

func (m *MemoryStore) Unlocked(lang string) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.data(lang).unlocked, nil
}

func (m *MemoryStore) SetUnlocked(lang string, n int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.data(lang).unlocked = n
	return nil
}

func (m *MemoryStore) AddSession(lang string, s Session) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	d := m.data(lang)
	d.sessions = append(d.sessions, s)
	return nil
}

func (m *MemoryStore) RecentSessions(lang string, limit int) ([]Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	all := m.data(lang).sessions
	out := []Session{}
	for i := len(all) - 1; i >= 0 && len(out) < limit; i-- {
		out = append(out, all[i])
	}
	return out, nil
}

func (m *MemoryStore) SessionCount(lang string) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.data(lang).sessions), nil
}

// Reset forgets the language; the next call to data() starts it from zero.
func (m *MemoryStore) Reset(lang string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.langs, lang)
	return nil
}
