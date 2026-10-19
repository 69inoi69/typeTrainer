// Package storage hides WHERE data is kept behind the Store interface.
// There are two versions of it:
//   - MemoryStore (memory.go): everything in RAM, lost on restart. The
//     default, the tests' store, and the only one on GitHub Pages
//     (a browser has no database).
//   - PostgresStore (postgres.go): a PostgreSQL database, used by the normal
//     server when DATABASE_URL is set (build_server.go).
//
// The rest of the app (internal/api) only ever sees the Store interface, so
// it does not know or care which one it talks to. Both must behave exactly
// alike: the same tests run against both (store_test.go).
//
// This package also defines the shapes that are stored (Session, User)
// and the user ids of guests (LocalUser, GuestPrefix).
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
	// Level is where Climb's difficulty stood at the end of the round, 0..1
	// (freeplay.NextLevel); the next round goes on from it. 0 in learning
	// and in old history.
	Level float64 `json:"level,omitempty"`
	// Group: the study group the round was typed in (learning only):
	// "" = the adaptive trainer, GroupRandom = the control group.
	Group string `json:"group,omitempty"`
	// Device: what the round was typed on, DeviceKeyboard or DeviceTouch;
	// "" = not known (history from before it was kept). Only recorded for
	// now: the letter model learns from both alike. Kept so the thesis can
	// check whether phone rounds should count differently.
	Device string `json:"device,omitempty"`
}

// Day is the practice of one calendar day, learning and free practice
// together: the stats screen builds its totals (time typing, rounds), the
// days in a row and the activity calendar from these.
type Day struct {
	Date    string  `json:"date"`    // "2026-10-18", in the user's own time zone
	Rounds  int     `json:"rounds"`  // finished rounds
	Seconds float64 `json:"seconds"` // time spent typing (RoundSeconds)
	Chars   int     `json:"chars"`   // letters typed
}

// RoundSeconds is about how long a round was typed: WPM counts the right
// letters, 5 to a word, so the time is right letters / 5 / WPM minutes. The
// right letters are Chars * Accuracy / 100 (Accuracy is the share of right
// presses). The duration itself is not stored; this works for old history
// too. A round with WPM 0 counts 0.
func RoundSeconds(wpm, accuracy float64, chars int) float64 {
	if wpm <= 0 {
		return 0
	}
	return float64(chars) * accuracy / 100 / 5 / wpm * 60
}

// The devices a round can be typed on (Session.Device).
const (
	DeviceKeyboard = "keyboard" // a physical keyboard
	DeviceTouch    = "touch"    // a touch screen (phone, tablet)
)

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
// The tests use it too.
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

// The errors a Store returns on purpose; callers check them with errors.Is.
// Any other error means the store itself failed (a broken database).
var (
	// ErrNameTaken is returned by CreateUser for a name that already has an account.
	ErrNameTaken = errors.New("storage: name taken")
	// ErrNotFound is returned for no such user, or an unknown or expired login.
	ErrNotFound = errors.New("storage: not found")
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
//
// Reading language data that was never stored is not an error: a new user
// or language reads as empty (no statistics, 0 letters open, no history).
//
// To add a method: add it here, implement it in BOTH memory.go and
// postgres.go, and add a test to storeTests in store_test.go, so the two
// stores are checked against the same behaviour. If it needs a new table
// or column, see migrations/.
type Store interface {
	// KeyStats is the letter model (engine.KeyStat per letter); the caller
	// may change the returned map freely. SaveKeyStats replaces the whole
	// set: a letter left out is gone.
	KeyStats(user, lang string) (map[string]engine.KeyStat, error)
	SaveKeyStats(user, lang string, stats map[string]engine.KeyStat) error

	// Unlocked is how many letters of the unlock order are open (0 = new user).
	Unlocked(user, lang string) (int, error)
	SetUnlocked(user, lang string, n int) error

	// History of learning. length picks rounds of one length ("words-30");
	// "" = all. A session without a length is stored as DefaultLength.
	AddSession(user, lang string, s Session) error
	RecentSessions(user, lang, length string, limit int) ([]Session, error) // newest first
	SessionCount(user, lang, length string) (int, error)                    // finished rounds
	SessionLengths(user, lang string) ([]string, error)                     // lengths in the history, sorted
	// BestRounds: the fastest learning round of every length in the
	// history (by WPM; of equal ones the earliest), without raw keys:
	// the personal bests of the stats screen.
	BestRounds(user, lang string) (map[string]Session, error)
	// LettersTyped: the letters (Session.Chars) of all learning rounds that
	// ended with at least `unlocked` letters open. With the whole alphabet,
	// it is how far the user is into the ramp of engine.MaxRank.
	LettersTyped(user, lang string, unlocked int) (int, error)

	// Group is the study group of the language ("" or GroupRandom), set
	// through a hidden link for a user study. Reset clears it.
	Group(user, lang string) (string, error)
	SetGroup(user, lang, group string) error

	// Climb, the second mode (internal/freeplay), is kept apart from
	// learning: its own history. Its rounds never change the letter
	// statistics above.
	AddFreeplaySession(user, lang string, s Session) error
	RecentFreeplaySessions(user, lang, length string, limit int) ([]Session, error) // newest first
	FreeplaySessionCount(user, lang, length string) (int, error)
	FreeplaySessionLengths(user, lang string) ([]string, error)
	BestFreeplayRounds(user, lang string) (map[string]Session, error) // as BestRounds

	// PracticeDays: every day with a finished round in this language,
	// learning and free practice together, oldest first. tz is the user's
	// offset from UTC (east is positive), so a day ends at their midnight.
	PracticeDays(user, lang string, tz time.Duration) ([]Day, error)

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
