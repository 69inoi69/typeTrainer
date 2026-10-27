package engine

import (
	"math"
	"testing"
)

func TestConsistencyEvenPaceIs100(t *testing.T) {
	v, ok := Consistency([]int{5, 5, 5, 5, 5}, 5)
	if !ok || !near(v, 100) {
		t.Fatalf("got %v, %v; want 100, true", v, ok)
	}
}

func TestConsistencyKnownValue(t *testing.T) {
	v, ok := Consistency([]int{2, 6, 2, 6}, 4)
	cv := 0.5
	want := 100 * (1 - math.Tanh(cv+math.Pow(cv, 3)/3+math.Pow(cv, 5)/5))
	if !ok || !near(v, want) {
		t.Fatalf("got %v, want %v", v, want)
	}
	if v < 50 || v > 55 {
		t.Fatalf("cv 0.5 should give about 52.6, got %v", v)
	}
}

func TestConsistencyScaleDoesNotMatter(t *testing.T) {
	a, _ := Consistency([]int{3, 5, 4, 6, 2}, 5)
	b, _ := Consistency([]int{36, 60, 48, 72, 24}, 5)
	if !near(a, b) {
		t.Fatalf("%v != %v", a, b)
	}
}

func TestConsistencyPausesLowerIt(t *testing.T) {
	even, _ := Consistency([]int{5, 5, 5, 5, 5, 5}, 5)
	pause, _ := Consistency([]int{5, 5, 0, 0, 5, 5}, 5)
	if !(pause < even) {
		t.Fatalf("a pause should lower consistency: %v vs %v", pause, even)
	}
}

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

func TestConsistencyStaysInRange(t *testing.T) {
	v, ok := Consistency([]int{40, 0, 0, 0, 0, 0, 0, 0, 0, 0}, 5)
	if !ok || v < 0 || v > 100 {
		t.Fatalf("got %v, %v; want 0..100", v, ok)
	}
}
