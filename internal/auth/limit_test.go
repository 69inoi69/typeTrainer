package auth

import (
	"strconv"
	"testing"
	"time"
)

var t0 = time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC)

// A key is refused after max attempts, only until its window ends; other
// keys are not affected.
func TestLimiter_RefusesAfterMaxThenOpensAgain(t *testing.T) {
	l := NewLimiter(3, 15*time.Minute)
	if w := l.Wait("1.2.3.4", t0); w != 0 {
		t.Fatalf("a new key must not wait: %v", w)
	}
	for i := 0; i < 3; i++ {
		if w := l.Wait("1.2.3.4", t0); w != 0 {
			t.Fatalf("attempt %d refused", i+1)
		}
		l.Count("1.2.3.4", t0.Add(time.Duration(i)*time.Minute))
	}
	// the 4th attempt waits until 15 minutes after the first one
	if w := l.Wait("1.2.3.4", t0.Add(5*time.Minute)); w != 10*time.Minute {
		t.Fatalf("wait = %v, want 10m", w)
	}
	if w := l.Wait("5.6.7.8", t0); w != 0 {
		t.Fatal("another key must not be refused")
	}
	if w := l.Wait("1.2.3.4", t0.Add(15*time.Minute)); w != 0 {
		t.Fatalf("after the window: %v", w)
	}
	// the next attempt starts a new window with a count of 1
	l.Count("1.2.3.4", t0.Add(16*time.Minute))
	if w := l.Wait("1.2.3.4", t0.Add(16*time.Minute)); w != 0 {
		t.Fatal("a new window must start from zero")
	}
}

// Forget (a successful login) frees the key at once.
func TestLimiter_Forget(t *testing.T) {
	l := NewLimiter(1, time.Hour)
	l.Count("k", t0)
	if l.Wait("k", t0) == 0 {
		t.Fatal("max 1: the second attempt must wait")
	}
	l.Forget("k")
	if l.Wait("k", t0) != 0 {
		t.Fatal("after Forget the key must be free")
	}
	l.Forget("never seen") // no panic
}

// Old windows are dropped once many keys are kept; live ones stay.
func TestLimiter_Prune(t *testing.T) {
	l := NewLimiter(1, time.Minute)
	l.Count("live", t0.Add(time.Hour))
	for i := 0; i < pruneAt; i++ {
		l.Count(strconv.Itoa(i), t0)
	}
	l.Count("trigger", t0.Add(time.Hour))
	if len(l.seen) != 2 {
		t.Fatalf("%d keys kept, want 2 (live, trigger)", len(l.seen))
	}
	if l.Wait("live", t0.Add(time.Hour)) == 0 {
		t.Fatal("pruning dropped a live window")
	}
}
