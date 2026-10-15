package auth

import (
	"sync"
	"time"
)

// Limiter stops password guessing: it counts attempts per key (the
// caller's IP address) and refuses a key that made too many in one window.
// Pure logic: the caller passes the time, so the tests need no clock.
// It lives in memory, so a restart forgets the counts; that is fine for
// one server process.
type Limiter struct {
	max    int           // attempts allowed in one window
	window time.Duration // how long the count lasts after the first attempt

	mu   sync.Mutex
	seen map[string]attempts
}

// attempts is the count of one key in its current window.
type attempts struct {
	count int
	since time.Time // the first attempt of this window
}

// pruneAt: when this many keys are kept, Count drops the finished windows,
// so the map cannot grow without end. Memory housekeeping only: it does not
// change who is refused.
const pruneAt = 1024

// NewLimiter allows max attempts per key in each window.
func NewLimiter(max int, window time.Duration) *Limiter {
	return &Limiter{max: max, window: window, seen: map[string]attempts{}}
}

// Wait says how long the key must wait before its next attempt: 0 means it
// may try now.
func (l *Limiter) Wait(key string, now time.Time) time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()
	a, ok := l.seen[key]
	if !ok || a.count < l.max {
		return 0
	}
	if left := a.since.Add(l.window).Sub(now); left > 0 {
		return left
	}
	return 0
}

// Count records one attempt of the key. A finished window starts again.
func (l *Limiter) Count(key string, now time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()
	a, ok := l.seen[key]
	if !ok || now.Sub(a.since) >= l.window {
		a = attempts{since: now}
	}
	a.count++
	l.seen[key] = a
	if len(l.seen) >= pruneAt {
		for k, v := range l.seen {
			if now.Sub(v.since) >= l.window {
				delete(l.seen, k)
			}
		}
	}
}

// Forget clears the key's count (after a successful login).
func (l *Limiter) Forget(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.seen, key)
}
