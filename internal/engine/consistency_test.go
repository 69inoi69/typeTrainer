package engine

import (
	"math"
	"testing"
)

// The same number of keys every second gives 100.
func TestConsistencyEvenPaceIs100(t *testing.T) {
	v, ok := Consistency([]int{5, 5, 5, 5, 5}, 5)
	if !ok || !near(v, 100) {
		t.Fatalf("got %v, %v; want 100, true", v, ok)
	}
}

// A case computed by hand matches the formula.
func TestConsistencyKnownValue(t *testing.T) {
	// mean 4, population sd 2 -> cv = 0.5
	v, ok := Consistency([]int{2, 6, 2, 6}, 4)
	cv := 0.5
	want := 100 * (1 - math.Tanh(cv+math.Pow(cv, 3)/3+math.Pow(cv, 5)/5))
	if !ok || !near(v, want) {
		t.Fatalf("got %v, want %v", v, want)
	}
	if v < 50 || v > 55 { // about 52.6
		t.Fatalf("cv 0.5 should give about 52.6, got %v", v)
	}
}

// Keys per second or WPM per second give the same value (cv has no unit).
func TestConsistencyScaleDoesNotMatter(t *testing.T) {
	// keys per second or raw WPM per second (x12): the same consistency
	a, _ := Consistency([]int{3, 5, 4, 6, 2}, 5)
	b, _ := Consistency([]int{36, 60, 48, 72, 24}, 5)
	if !near(a, b) {
		t.Fatalf("%v != %v", a, b)
	}
}

// Seconds without keys count, so a pause lowers consistency.
func TestConsistencyPausesLowerIt(t *testing.T) {
	even, _ := Consistency([]int{5, 5, 5, 5, 5, 5}, 5)
	pause, _ := Consistency([]int{5, 5, 0, 0, 5, 5}, 5)
	if !(pause < even) {
		t.Fatalf("a pause should lower consistency: %v vs %v", pause, even)
	}
}

// Too short, empty or all-zero rounds give no value (ok = false).
func TestConsistencyNotEnoughData(t *testing.T) {
	cases := map[string][]int{
		"nil":       nil,
		"empty":     {},
		"too short": {5, 5, 5},
		"all zero":  {0, 0, 0, 0, 0},
	}
	for name, in := range cases {
		if v, ok := Consistency(in, 5); ok || v != 0 {
			t.Errorf("%s: got %v, %v; want 0, false", name, v, ok)
		}
	}
}

// Even a very uneven round stays within 0..100.
func TestConsistencyStaysInRange(t *testing.T) {
	v, ok := Consistency([]int{40, 0, 0, 0, 0, 0, 0, 0, 0, 0}, 5) // cv = 3
	if !ok || v < 0 || v > 100 {
		t.Fatalf("got %v, %v; want 0..100", v, ok)
	}
}
