// Package storage hides WHERE data is kept behind the Store interface.
// Right now there is an in-memory version (memory.go). Later you add
// postgres.go implementing the same interface and change one line in setup.go.
package storage

import (
	"errors"
	"strings"
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
	// Length is the round length the user chose in the settings, as
	// "words-30" or "time-60" (ValidLength). Rounds of different lengths
	// are not compared with each other: the stats screen shows one length
	// at a time. Stores fill in DefaultLength when it is empty.
	Length string `json:"length,omitempty"`

	// Keys is the raw record of the round: every typed letter in order,
	// with its mistakes and time, exactly as the browser measured it. The
	// letter model can be replayed from it (engine.Apply), so parameters
	// can be tested on real data later. Empty for history from before it
	// was kept.
	Keys []engine.Sample `json:"keys,omitempty"`
	// Unlocked is how many letters were open after the round (learning
	// only; 0 in free practice and in old history).
	Unlocked int `json:"unlocked,omitempty"`
	// Group: the study group the round was typed in (learning only):
	// "" = the adaptive trainer, GroupRandom = the control group.
	Group string `json:"group,omitempty"`
}

// GroupRandom is the control group of a user study (docs/ALGORITHM.md
// section 11): learning works as usual, but the words of the open letters
// are drawn at random instead of by the algorithm. "" = the normal app.
const GroupRandom = "random"

// DefaultLength is the length of every round from before the settings
// existed: 30 words.
const DefaultLength = "words-30"

// WithLength returns the session with DefaultLength if it has no length.
func (s Session) WithLength() Session {
	if s.Length == "" {
		s.Length = DefaultLength
	}
	return s
}

// Summary is the session without its raw keys: what lists of many
// sessions (the stats pages) need.
func (s Session) Summary() Session {
	s.Keys = nil
	return s
}

// LocalUser is the user id of a guest where browsers cannot be told apart:
// on GitHub Pages (no cookies) and for a browser that refuses cookies.
const LocalUser = "local"

// GuestPrefix starts the id of a guest the server knows by their guest
// cookie: "g" + the hash of the cookie (api.Server.WithGuest). Account ids
// start with "u", so the two never clash.
const GuestPrefix = "g"

// IsGuest says whether the id belongs to a guest (not to an account).
func IsGuest(user string) bool {
	return user == LocalUser || strings.HasPrefix(user, GuestPrefix)
}

// User is an account. The password is only kept as a hash (auth.HashPassword).
type User struct {
	ID           string    `json:"id"`   // never "local"; given by the store
	Name         string    `json:"name"` // unique, already normalized (auth.NormalizeName)
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"createdAt"`
}

var (
	ErrNameTaken = errors.New("storage: name taken")
	ErrNotFound  = errors.New("storage: not found")
)

// Store is every data operation the app needs. Nothing outside this
// package should know how the data is actually stored.
//
// Every method takes two ids:
//   - the user: an account id, or a guest's id (IsGuest). Each person has
//     their own data.
//   - the language ("en", "pl", ...): each language has its own letter
//     statistics, its own unlock progress and its own history, because being
//     good at English says nothing about Ukrainian.
type Store interface {
	KeyStats(user, lang string) (map[string]engine.KeyStat, error)
	SaveKeyStats(user, lang string, stats map[string]engine.KeyStat) error

	// Unlocked is how many letters of the unlock order are open (0 = new user).
	Unlocked(user, lang string) (int, error)
	SetUnlocked(user, lang string, n int) error

	// History. length picks rounds of one length ("words-30"); "" = all.
	AddSession(user, lang string, s Session) error
	RecentSessions(user, lang, length string, limit int) ([]Session, error) // newest first
	SessionCount(user, lang, length string) (int, error)                    // finished rounds
	SessionLengths(user, lang string) ([]string, error)                     // lengths in the history, sorted
	// LettersTyped: the letters (Session.Chars) of all learning rounds that
	// ended with at least `unlocked` letters open. With the whole alphabet,
	// it is how far the user is into the ramp of engine.MaxRank.
	LettersTyped(user, lang string, unlocked int) (int, error)

	// Free practice (internal/freeplay) is kept apart from learning: its
	// own history, and a flag set once the typing test is passed. Its
	// rounds never change the letter statistics above.
	// Group is the study group of the language ("" or GroupRandom), set
	// through a hidden link for a user study. Reset clears it.
	Group(user, lang string) (string, error)
	SetGroup(user, lang, group string) error

	TestPassed(user, lang string) (bool, error)
	SetTestPassed(user, lang string, passed bool) error
	AddFreeplaySession(user, lang string, s Session) error
	RecentFreeplaySessions(user, lang, length string, limit int) ([]Session, error) // newest first
	FreeplaySessionCount(user, lang, length string) (int, error)
	FreeplaySessionLengths(user, lang string) ([]string, error)

	// Reset deletes everything the user has stored for the language, free
	// practice included: it is new again. Other users and languages stay.
	Reset(user, lang string) error

	// Accounts. CreateUser fails with ErrNameTaken if the name exists;
	// UserByName and UserByID with ErrNotFound if there is no such user.
	CreateUser(name, passwordHash string, now time.Time) (User, error)
	UserByName(name string) (User, error)
	UserByID(id string) (User, error)

	// Logins: which user a login cookie belongs to. The store keeps only
	// the hash of the cookie's token (auth.HashToken), never the token.
	// LoginUser returns the user id, or ErrNotFound for an unknown or
	// expired login.
	AddLogin(tokenHash, userID string, expires time.Time) error
	LoginUser(tokenHash string, now time.Time) (string, error)
	DeleteLogin(tokenHash string) error
}
