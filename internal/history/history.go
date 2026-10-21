// Package history reads a typist's finished rounds (storage.Session) and
// draws conclusions the stats screen shows: how many rounds in a row were
// accurate. It never changes anything and knows nothing about HTTP or
// databases: internal/api loads the rounds and hands them in.
//
// To add a reading of the history: a pure function here over sessions
// oldest first, a test in history_test.go, and its field in the stats
// answer (internal/api).
package history

import "typingtrainer/internal/storage"

// Streak is the accuracy streak at one threshold: rounds in a row with at
// least Min % accuracy. Longest is the record over the whole history,
// Current the run that ends with the last round (0 if the last round was
// below Min).
type Streak struct {
	Min     float64 `json:"min"`
	Longest int     `json:"longest"`
	Current int     `json:"current"`
}

// AccuracyStreaks returns one Streak per threshold in mins, in the same
// order. sessions are oldest first. Accuracy is rounded first (as the
// screen shows it), so a round shown as 95% counts for 95.
func AccuracyStreaks(sessions []storage.Session, mins []float64) []Streak {
	out := make([]Streak, len(mins))
	for i, m := range mins {
		out[i].Min = m
		run := 0
		for _, s := range sessions {
			if roundPct(s.Accuracy) >= m {
				run++
				out[i].Longest = max(out[i].Longest, run)
			} else {
				run = 0
			}
		}
		out[i].Current = run
	}
	return out
}

// roundPct rounds a percentage to a whole number, half up.
func roundPct(v float64) float64 {
	return float64(int(v + 0.5))
}
