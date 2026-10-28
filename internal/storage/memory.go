// The in-memory Store.

package storage

import (
	"sort"
	"strconv"
	"sync"
	"time"

	"typingtrainer/internal/engine"
)

type MemoryStore struct {
	mu    sync.Mutex
	langs map[key]*langData

	users  map[string]User
	names  map[string]string
	logins map[string]login
}

type login struct {
	userID  string
	expires time.Time
}

type key struct{ user, lang string }

type langData struct {
	stats    map[string]engine.KeyStat
	unlocked int
	lap      int
	group    string
	sessions []Session

	freeplay map[string][]Session
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{langs: map[key]*langData{}, users: map[string]User{}, names: map[string]string{}, logins: map[string]login{}}
}

func (m *MemoryStore) data(user, lang string) *langData {
	k := key{user, lang}
	d, ok := m.langs[k]
	if !ok {
		d = &langData{stats: map[string]engine.KeyStat{}}
		m.langs[k] = d
	}
	return d
}

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

func (m *MemoryStore) Lap(user, lang string) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.data(user, lang).lap, nil
}

func (m *MemoryStore) SetLap(user, lang string, n int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.data(user, lang).lap = n
	return nil
}

func (m *MemoryStore) AddSession(user, lang string, s Session) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	d := m.data(user, lang)
	if d.hasRound(s.Round) {
		return nil
	}
	d.sessions = append(d.sessions, s.WithLength())
	return nil
}

func (m *MemoryStore) SaveLearned(user, lang string, l Learned) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	d := m.data(user, lang)
	if l.Stats != nil {
		d.stats = make(map[string]engine.KeyStat, len(l.Stats))
		for k, v := range l.Stats {
			d.stats[k] = v
		}
		d.unlocked, d.lap = l.Unlocked, l.Lap
	}
	if l.Session != nil && !d.hasRound(l.Session.Round) {
		d.sessions = append(d.sessions, l.Session.WithLength())
	}
	return nil
}

func (m *MemoryStore) HasRound(user, lang, round string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.data(user, lang).hasRound(round), nil
}

func (d *langData) hasRound(round string) bool {
	if round == "" {
		return false
	}
	for _, s := range d.sessions {
		if s.Round == round {
			return true
		}
	}
	for _, list := range d.freeplay {
		for _, s := range list {
			if s.Round == round {
				return true
			}
		}
	}
	return false
}

func (m *MemoryStore) RecentSessions(user, lang, length string, limit int) ([]Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return newestFirst(m.data(user, lang).sessions, length, limit), nil
}

func newestFirst(all []Session, length string, limit int) []Session {
	out := []Session{}
	for i := len(all) - 1; i >= 0 && len(out) < limit; i-- {
		if length == "" || all[i].Length == length {
			out = append(out, all[i])
		}
	}
	return out
}

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
	all := append([]Session{}, d.sessions...)
	for _, h := range d.freeplay {
		all = append(all, h...)
	}
	for _, s := range all {
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

func (m *MemoryStore) AddFreeplaySession(user, lang, mode string, s Session) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	d := m.data(user, lang)
	if d.hasRound(s.Round) {
		return nil
	}
	if d.freeplay == nil {
		d.freeplay = map[string][]Session{}
	}
	d.freeplay[mode] = append(d.freeplay[mode], s.WithLength())
	return nil
}

func (m *MemoryStore) RecentFreeplaySessions(user, lang, mode, length string, limit int) ([]Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return newestFirst(m.data(user, lang).freeplay[mode], length, limit), nil
}

func (m *MemoryStore) BestFreeplayRounds(user, lang, mode string) (map[string]Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return bestOf(m.data(user, lang).freeplay[mode]), nil
}

func (m *MemoryStore) FreeplaySessionCount(user, lang, mode, length string) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return countLength(m.data(user, lang).freeplay[mode], length), nil
}

func (m *MemoryStore) FreeplaySessionLengths(user, lang, mode string) ([]string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return lengths(m.data(user, lang).freeplay[mode]), nil
}

func (m *MemoryStore) Reset(user, lang string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.langs, key{user, lang})
	return nil
}

func (m *MemoryStore) CreateUser(name, passwordHash string, now time.Time, from string) (User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.users[name]; ok {
		return User{}, ErrNameTaken
	}
	u := User{ID: "u" + strconv.Itoa(len(m.users)+1), Name: name, PasswordHash: passwordHash, CreatedAt: now}
	m.users[name] = u
	m.names[u.ID] = name
	if from != "" {
		for k, d := range m.langs {
			if k.user == from {
				delete(m.langs, k)
				m.langs[key{u.ID, k.lang}] = d
			}
		}
	}
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
