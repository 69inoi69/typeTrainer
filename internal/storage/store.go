// Package storage hides WHERE data is kept behind the Store interface.
// Right now there is an in-memory version (memory.go). Later you add
// postgres.go implementing the same interface and change one line in setup.go.
package storage

import (
	"time"

	"typingtrainer/internal/engine"
)

// Session is one finished round: its summary numbers and, since raw
// results are kept, every keypress of the round.
type Session struct {
	WPM      float64 `json:"wpm"`
	Accuracy float64 `json:"accuracy"` // 0..100
	Chars    int     `json:"chars"`
	// Consistency of the speed, 0..100 (engine.Consistency). nil = not
	// measured: a round too short to judge, or history from before it existed.
	Consistency *float64  `json:"consistency,omitempty"`
	FinishedAt  time.Time `json:"finishedAt"`

	// Keys is the raw record of the round: every typed letter in order,
	// with its mistakes and time, exactly as the browser measured it. The
	// letter model can be replayed from it (engine.Apply), so parameters
	// can be tested on real data later. Empty for history from before it
	// was kept.
	Keys []engine.Sample `json:"keys,omitempty"`
	// Unlocked is how many letters were open after the round (learning
	// only; 0 in free practice and in old history).
	Unlocked int `json:"unlocked,omitempty"`
}

// Summary is the session without its raw keys: what lists of many
// sessions (the stats pages) need.
func (s Session) Summary() Session {
	s.Keys = nil
	return s
}

// LocalUser is the user id of everyone while there are no accounts: the
// person sitting at this server or browser tab.
const LocalUser = "local"

// Store is every data operation the app needs. Nothing outside this
// package should know how the data is actually stored.
//
// Every method takes two ids:
//   - the user ("local" for now, see LocalUser): each person has their own
//     data. With accounts this becomes the account id.
//   - the language ("en", "pl", ...): each language has its own letter
//     statistics, its own unlock progress and its own history, because being
//     good at English says nothing about Ukrainian.
type Store interface {
	KeyStats(user, lang string) (map[string]engine.KeyStat, error)
	SaveKeyStats(user, lang string, stats map[string]engine.KeyStat) error

	// Unlocked is how many letters of the unlock order are open (0 = new user).
	Unlocked(user, lang string) (int, error)
	SetUnlocked(user, lang string, n int) error

	AddSession(user, lang string, s Session) error
	RecentSessions(user, lang string, limit int) ([]Session, error) // newest first
	SessionCount(user, lang string) (int, error)                    // all finished exercises

	// Free practice (internal/freeplay) is kept apart from learning: its
	// own history, and a flag set once the typing test is passed. Its
	// rounds never change the letter statistics above.
	TestPassed(user, lang string) (bool, error)
	SetTestPassed(user, lang string, passed bool) error
	AddFreeplaySession(user, lang string, s Session) error
	RecentFreeplaySessions(user, lang string, limit int) ([]Session, error) // newest first
	FreeplaySessionCount(user, lang string) (int, error)

	// Reset deletes everything the user has stored for the language, free
	// practice included: it is new again. Other users and languages stay.
	Reset(user, lang string) error
}
