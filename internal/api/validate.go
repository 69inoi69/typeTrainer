// Request checks.

package api

import (
	"math"
	"strconv"
	"strings"
	"unicode/utf8"

	"typingtrainer/internal/engine"
	"typingtrainer/internal/storage"
)

func validate(req resultsRequest, maxChars, maxEvents int, alphabet string) string {
	if req.Chars < 1 || req.Chars > maxChars {
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
	if len(req.Round) > 64 || strings.Trim(req.Round, "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-") != "" {
		return "round: at most 64 letters, digits and -"
	}
	return ""
}

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

func validGroup(g string) bool { return g == "" || g == storage.GroupRandom }

func validDevice(d string) bool {
	return d == "" || d == storage.DeviceKeyboard || d == storage.DeviceTouch
}

func validateSamples(samples []engine.Sample, max int, alphabet string) string {
	if len(samples) > max {
		return "samples: wrong number of samples"
	}
	for _, smp := range samples {
		if utf8.RuneCountInString(smp.Char) != 1 || smp.Ms < 0 || smp.Errors < 0 {
			return "samples: each needs exactly one char, errors >= 0 and ms >= 0"
		}
		if smp.Typed != "" && (utf8.RuneCountInString(smp.Typed) != 1 || smp.Errors == 0) {
			return "samples: typed is one char, and only with errors"
		}
		if smp.Char != " " && !strings.Contains(alphabet, smp.Char) {
			return "samples: " + smp.Char + " is not a letter of this language"
		}
	}
	return ""
}

func validateImport(in langExport, maxSessions, maxEvents, letters, levels, laps int, alphabet string, okLength func(string) bool, okFreetype func(string) bool, freetypeAlphabet string) string {
	if in.Unlocked < 0 || in.Unlocked > letters {
		return "unlocked: out of range"
	}
	if !validGroup(in.Group) {
		return "group: unknown"
	}
	if in.Lap < 0 || in.Lap > laps {
		return "lap: out of range"
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
	if msg := validateSessions(in.Sessions, maxSessions, maxEvents, letters, laps, alphabet, okLength); msg != "" {
		return msg
	}
	for _, sess := range in.Sessions {
		if sess.Level != 0 {
			return "sessions: a learning round has no level"
		}
	}
	if in.Freeplay != nil {
		if msg := validateSessions(in.Freeplay.Sessions, maxSessions, maxEvents, letters, 0, climbAlphabet(alphabet), okLength); msg != "" {
			return "freeplay " + msg
		}
		for _, sess := range in.Freeplay.Sessions {
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
		if msg := validateSessions(f.Sessions, maxSessions, maxEvents, letters, 0, freetypeAlphabet, okLength); msg != "" {
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

func validateSessions(sessions []storage.Session, max, maxEvents, letters, laps int, alphabet string, okLength func(string) bool) string {
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
		if sess.Lap < 0 || sess.Lap > laps {
			return "sessions: lap out of range"
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
