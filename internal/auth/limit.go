package auth

import (
	"sync"
	"time"
)

type Limiter struct {
	max    int
	window time.Duration

	mu   sync.Mutex
	seen map[string]attempts
}

type attempts struct {
	count int
	since time.Time
}

const pruneAt = 1024

func NewLimiter(max int, window time.Duration) *Limiter {
	return &Limiter{max: max, window: window, seen: map[string]attempts{}}
}

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

func (l *Limiter) Forget(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.seen, key)
}
