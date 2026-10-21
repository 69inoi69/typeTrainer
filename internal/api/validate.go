// Request checks: nothing impossible or foreign may reach the statistics.
// Each function returns "" when the input is fine, else the error message.
// The browser is never trusted: anyone can send any JSON to the API, and a
// single wrong number (a negative time, a letter from another alphabet)
// would spoil a user's letter model for good.
//
// To add a field to a request or to the export file: check its range here,
// in the same style, and add a bad case to the tests in setup_test.go.

package api

import (
	"math"
	"strconv"
	"strings"
	"unicode/utf8"

	"typingtrainer/internal/engine"
	"typingtrainer/internal/storage"
)

// validate checks a results request: a round needs at least one typed
// character, and samples as in validateSamples.
func validate(req resultsRequest, maxEvents int, alphabet string) string {
	// 1<<20 characters (about a million) and 400 WPM (below) are far above any
	// real round: they only stop absurd numbers, not fast typists
	if req.Chars < 1 || req.Chars > 1<<20 {
		return "chars: out of range"
	}
	if msg := validateSamples(req.Samples, maxEvents, alphabet); msg != "" {
		return msg
	}
	if msg := validateSamples(req.Keys, maxEvents, alphabet); msg != "" {
		return "keys: " + msg
	}
	if req.WPM < 0 || req.WPM > 400 || req.Accuracy < 0 || req.Accuracy > 100 {
		return "wpm or accuracy out of range"
	}
	if len(req.PerSecond) > maxEvents {
		return "perSecond: too many seconds"
	}
	for _, c := range req.PerSecond {
		if c < 0 || c > maxEvents {
			return "perSecond: each count must be between 0 and the number of events"
		}
	}
	if !validDevice(req.Device) {
		return "device: unknown device"
	}
	return ""
}

// validLength checks a round length: "" (DefaultLength), "words-N" with
// 1 <= N <= maxWords, or "time-N" with 1 <= N <= maxSeconds seconds.
func validLength(length string, maxWords, maxSeconds int) bool {
	if length == "" {
		return true
	}
	kind, num, ok := strings.Cut(length, "-")
	n, err := strconv.Atoi(num)
	if !ok || err != nil || n < 1 || strconv.Itoa(n) != num {
		return false
	}
	switch kind {
	case "words":
		return n <= maxWords
	case "time":
		return n <= maxSeconds
	}
	return false
}

// validGroup accepts "" (the normal app) or storage.GroupRandom.
func validGroup(g string) bool { return g == "" || g == storage.GroupRandom }

// validDevice accepts "" (not known), storage.DeviceKeyboard or storage.DeviceTouch.
func validDevice(d string) bool {
	return d == "" || d == storage.DeviceKeyboard || d == storage.DeviceTouch
}

// validateSamples accepts at most max samples, every one a single letter of
// the language's alphabet or a space, so junk keys never end up in the statistics.
func validateSamples(samples []engine.Sample, max int, alphabet string) string {
	if len(samples) > max {
		return "samples: wrong number of samples"
	}
	for _, smp := range samples {
		if utf8.RuneCountInString(smp.Char) != 1 || smp.Ms < 0 || smp.Errors < 0 {
			return "samples: each needs exactly one char, errors >= 0 and ms >= 0"
		}
		// the wrong key: any one character (a capital or a mark is a real
		// mistake too), and only where there was a mistake
		if smp.Typed != "" && (utf8.RuneCountInString(smp.Typed) != 1 || smp.Errors == 0) {
			return "samples: typed is one char, and only with errors"
		}
		if smp.Char != " " && !strings.Contains(alphabet, smp.Char) {
			return "samples: " + smp.Char + " is not a letter of this language"
		}
	}
	return ""
}

// validateImport makes sure a loaded file cannot put impossible numbers or
// foreign letters into the statistics. letters = how many letters the
// language's unlock order has, levels how many levels Climb has.
func validateImport(in langExport, maxSessions, maxEvents, letters, levels int, alphabet string, okLength func(string) bool, okFreetype func(string) bool, freetypeAlphabet string) string {
	if in.Unlocked < 0 || in.Unlocked > letters {
		return "unlocked: out of range"
	}
	if !validGroup(in.Group) {
		return "group: unknown"
	}
	for ch, k := range in.Keys {
		if utf8.RuneCountInString(ch) != 1 || (ch != " " && !strings.Contains(alphabet, ch)) {
			return "keys: " + ch + " is not a letter of this language"
		}
		if k.Count < 0 || k.Mistakes < 0 || k.Mistakes > k.Count ||
			k.TimedCount < 0 || k.TimedCount > k.Count ||
			k.ErrEMA < 0 || k.ErrEMA > 1 || k.TimeEMA < 0 {
			return "keys: impossible numbers for " + ch
		}
	}
	if msg := validateSessions(in.Sessions, maxSessions, maxEvents, letters, alphabet, okLength); msg != "" {
		return msg
	}
	for _, sess := range in.Sessions {
		if sess.Level != 0 {
			return "sessions: a learning round has no level"
		}
	}
	if in.Freeplay != nil {
		if msg := validateSessions(in.Freeplay.Sessions, maxSessions, maxEvents, letters, climbAlphabet(alphabet), okLength); msg != "" {
			return "freeplay " + msg
		}
		for _, sess := range in.Freeplay.Sessions {
			// a file from before the ten levels (no climbLevels): 0..1,
			// turned into a level by handleImport
			old := in.ClimbLevels == 0 && inRange(sess.Level, 0, 1)
			if !old && (sess.Level != math.Trunc(sess.Level) || !inRange(sess.Level, 1, float64(levels))) {
				return "freeplay sessions: level out of range"
			}
		}
	}
	for list, f := range in.Freetype {
		if !okFreetype(list) {
			return "freetype: unknown list " + list
		}
		if msg := validateSessions(f.Sessions, maxSessions, maxEvents, letters, freetypeAlphabet, okLength); msg != "" {
			return "freetype " + msg
		}
		for _, sess := range f.Sessions {
			if sess.Level != 0 {
				return "freetype: a round has no level"
			}
		}
	}
	return ""
}

// validateSessions accepts at most max entries, every number in its range,
// raw keys as in validateSamples (at most maxEvents per session).
func validateSessions(sessions []storage.Session, max, maxEvents, letters int, alphabet string, okLength func(string) bool) string {
	if len(sessions) > max {
		return "sessions: too many"
	}
	for _, sess := range sessions {
		if sess.WPM < 0 || sess.WPM > 400 || sess.Accuracy < 0 || sess.Accuracy > 100 || sess.Chars < 0 {
			return "sessions: wpm, accuracy or chars out of range"
		}
		if c := sess.Consistency; c != nil && (*c < 0 || *c > 100) {
			return "sessions: consistency out of range"
		}
		if sess.Unlocked < 0 || sess.Unlocked > letters {
			return "sessions: unlocked out of range"
		}
		if !okLength(sess.Length) {
			return "sessions: unknown length " + sess.Length
		}
		if !validGroup(sess.Group) {
			return "sessions: unknown group " + sess.Group
		}
		if !validDevice(sess.Device) {
			return "sessions: unknown device " + sess.Device
		}
		if msg := validateSamples(sess.Keys, maxEvents, alphabet); msg != "" {
			return "sessions: keys: " + msg
		}
	}
	return ""
}
