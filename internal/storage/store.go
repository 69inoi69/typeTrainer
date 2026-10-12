// Package storage hides WHERE data is kept behind the Store interface.
// Right now there is an in-memory version (memory.go). Later you add
// postgres.go implementing the same interface and change one line in setup.go.
package storage

import (
	"time"

	"typingtrainer/internal/engine"
)

// Session is the summary of one finished exercise.
type Session struct {
	WPM        float64   `json:"wpm"`
	Accuracy   float64   `json:"accuracy"` // 0..100
	Chars      int       `json:"chars"`
	FinishedAt time.Time `json:"finishedAt"`
}

// Store is every data operation the app needs. Nothing outside this
// package should know how the data is actually stored.
//
// Every method takes the language id ("en", "pl", ...): each language has its
// own letter statistics, its own unlock progress and its own history,
// because being good at English says nothing about Ukrainian.
type Store interface {
	KeyStats(lang string) (map[string]engine.KeyStat, error)
	SaveKeyStats(lang string, stats map[string]engine.KeyStat) error

	// Unlocked is how many letters of the unlock order are open (0 = new user).
	Unlocked(lang string) (int, error)
	SetUnlocked(lang string, n int) error

	AddSession(lang string, s Session) error
	RecentSessions(lang string, limit int) ([]Session, error) // newest first
	SessionCount(lang string) (int, error)                    // all finished exercises
}
