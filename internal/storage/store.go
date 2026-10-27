// Package storage keeps all data behind the Store interface.
package storage

import (
	"errors"
	"strconv"
	"strings"
	"time"

	"typingtrainer/internal/engine"
)

type Session struct {
	WPM         float64   `json:"wpm"`
	Accuracy    float64   `json:"accuracy"`
	Chars       int       `json:"chars"`
	Consistency *float64  `json:"consistency,omitempty"`
	FinishedAt  time.Time `json:"finishedAt"`
	Length      string    `json:"length,omitempty"`

	Keys     []engine.Sample `json:"keys,omitempty"`
	Unlocked int             `json:"unlocked,omitempty"`
	Level    float64         `json:"level,omitempty"`
	Lap      int             `json:"lap,omitempty"`
	Group    string          `json:"group,omitempty"`
	Device   string          `json:"device,omitempty"`
	Round    string          `json:"-"`
}

const ModeClimb = "freeplay"

const (
	VariantLong      = "long"
	VariantSentences = "sentences"
	VariantCustom    = "custom"
)

var FreetypeVariants = []string{"", VariantLong, VariantSentences, VariantCustom}

func Listless(variant string) bool { return variant == VariantSentences || variant == VariantCustom }

func FreetypeKey(n int, variant string) string {
	switch {
	case variant == "":
		return strconv.Itoa(n)
	case Listless(variant):
		return variant
	}
	return strconv.Itoa(n) + "-" + variant
}

func FreetypeMode(n int, variant string) string { return "freetype-" + FreetypeKey(n, variant) }

func ParseFreetypeKey(key string) (n int, variant string, ok bool) {
	if Listless(key) {
		return 0, key, true
	}
	num, rest, dash := strings.Cut(key, "-")
	n, err := strconv.Atoi(num)
	if err != nil || n <= 0 || Listless(rest) || (dash && rest == "") {
		return 0, "", false
	}
	for _, v := range FreetypeVariants {
		if v == rest {
			return n, v, true
		}
	}
	return 0, "", false
}

type Day struct {
	Date    string  `json:"date"`
	Rounds  int     `json:"rounds"`
	Seconds float64 `json:"seconds"`
	Chars   int     `json:"chars"`
}

func RoundSeconds(wpm, accuracy float64, chars int) float64 {
	if wpm <= 0 {
		return 0
	}
	return float64(chars) * accuracy / 100 / 5 / wpm * 60
}

const (
	DeviceKeyboard = "keyboard"
	DeviceTouch    = "touch"
)

const GroupRandom = "random"

const DefaultLength = "words-30"

func (s Session) WithLength() Session {
	if s.Length == "" {
		s.Length = DefaultLength
	}
	return s
}

func (s Session) Summary() Session {
	s.Keys = nil
	return s
}

const LocalUser = "local"

const GuestPrefix = "g"

func IsGuest(user string) bool {
	return user == LocalUser || strings.HasPrefix(user, GuestPrefix)
}

type User struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"createdAt"`
}

var (
	ErrNameTaken = errors.New("storage: name taken")
	ErrNotFound  = errors.New("storage: not found")
)

type Learned struct {
	Stats    map[string]engine.KeyStat
	Unlocked int
	Lap      int
	Session  *Session
}

type Store interface {
	KeyStats(user, lang string) (map[string]engine.KeyStat, error)
	SaveKeyStats(user, lang string, stats map[string]engine.KeyStat) error

	Unlocked(user, lang string) (int, error)
	SetUnlocked(user, lang string, n int) error
	Lap(user, lang string) (int, error)
	SetLap(user, lang string, n int) error

	AddSession(user, lang string, s Session) error
	RecentSessions(user, lang, length string, limit int) ([]Session, error)
	SessionCount(user, lang, length string) (int, error)
	SessionLengths(user, lang string) ([]string, error)
	BestRounds(user, lang string) (map[string]Session, error)
	LettersTyped(user, lang string, unlocked int) (int, error)

	Group(user, lang string) (string, error)
	SetGroup(user, lang, group string) error

	AddFreeplaySession(user, lang, mode string, s Session) error
	RecentFreeplaySessions(user, lang, mode, length string, limit int) ([]Session, error)
	FreeplaySessionCount(user, lang, mode, length string) (int, error)
	FreeplaySessionLengths(user, lang, mode string) ([]string, error)
	BestFreeplayRounds(user, lang, mode string) (map[string]Session, error)

	HasRound(user, lang, round string) (bool, error)
	SaveLearned(user, lang string, l Learned) error

	PracticeDays(user, lang string, tz time.Duration) ([]Day, error)

	Reset(user, lang string) error

	CreateUser(name, passwordHash string, now time.Time) (User, error)
	UserByName(name string) (User, error)
	UserByID(id string) (User, error)

	AddLogin(tokenHash, userID string, expires time.Time) error
	LoginUser(tokenHash string, now time.Time) (string, error)
	DeleteLogin(tokenHash string) error
}
