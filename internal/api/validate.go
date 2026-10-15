// Request checks: nothing impossible or foreign may reach the statistics.
// Each function returns "" when the input is fine, else the error message.

package api

import (
	"strings"
	"unicode/utf8"

	"typingtrainer/internal/engine"
	"typingtrainer/internal/storage"
)

// validate checks a results request: a round needs at least one typed
// character, and samples as in validateSamples.
func validate(req resultsRequest, maxEvents int, alphabet string) string {
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
	return ""
}

// validateSamples: at most max samples, every one a single letter of
// the language's alphabet or a space, so junk keys never end up in the statistics.
func validateSamples(samples []engine.Sample, max int, alphabet string) string {
	if len(samples) > max {
		return "samples: wrong number of samples"
	}
	for _, smp := range samples {
		if utf8.RuneCountInString(smp.Char) != 1 || smp.Ms < 0 || smp.Errors < 0 {
			return "samples: each needs exactly one char, errors >= 0 and ms >= 0"
		}
		if smp.Char != " " && !strings.Contains(alphabet, smp.Char) {
			return "samples: " + smp.Char + " is not a letter of this language"
		}
	}
	return ""
}

// validateImport makes sure a loaded file cannot put impossible numbers or
// foreign letters into the statistics. letters = how many letters the
// language's unlock order has.
func validateImport(in langExport, maxSessions, maxEvents, letters int, alphabet string) string {
	if in.Unlocked < 0 || in.Unlocked > letters {
		return "unlocked: out of range"
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
	if msg := validateSessions(in.Sessions, maxSessions, maxEvents, letters, alphabet); msg != "" {
		return msg
	}
	if in.Freeplay != nil {
		if msg := validateSessions(in.Freeplay.Sessions, maxSessions, maxEvents, letters, alphabet); msg != "" {
			return "freeplay " + msg
		}
	}
	return ""
}

// validateSessions: at most max entries, every number in its range, raw
// keys as in validateSamples (at most maxEvents per session).
func validateSessions(sessions []storage.Session, max, maxEvents, letters int, alphabet string) string {
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
		if msg := validateSamples(sess.Keys, maxEvents, alphabet); msg != "" {
			return "sessions: keys: " + msg
		}
	}
	return ""
}
