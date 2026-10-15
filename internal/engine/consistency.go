package engine

import "math"

// This file is a MEASUREMENT of a finished round, not part of the adaptive
// model: nothing here changes what the trainer practises next.
//
// Consistency answers "how even was the speed?". The browser counts the
// keypresses in every full second of the round; a typist who keeps one pace
// gets about the same number every second, one who rushes and stops gets
// very different numbers.
//
//	cv          = standard deviation / mean       (coefficient of variation)
//	consistency = 100 * (1 - tanh(cv + cv^3/3 + cv^5/5))
//
// cv has no unit, so it does not matter whether the counts are keypresses
// per second or raw WPM per second (that is the same number times 12). The
// tanh mapping turns cv from [0, infinity) into a percentage from 100 (every
// second the same) down towards 0. Inside the tanh are the first terms of the
// series of artanh(cv), so for small cv the result is close to 100 * (1 - cv).
// The same formula is used by monkeytype ("kogasa", packages/util/src/numbers.ts).
// internal/api calls it when a round is saved; the minimum length is
// config.ConsistencyMinSeconds.

// Consistency returns the consistency of a round, 0..100. perSecond = keypresses in each full second
// of the round, pauses included (a second without keys is a 0). ok is false
// when the round has fewer than minSeconds seconds (too little to judge) or
// no keypress at all.
func Consistency(perSecond []int, minSeconds int) (value float64, ok bool) {
	n := len(perSecond)
	if n == 0 || n < minSeconds {
		return 0, false
	}
	sum := 0.0
	for _, c := range perSecond {
		sum += float64(c)
	}
	mean := sum / float64(n)
	if mean == 0 {
		return 0, false
	}
	sq := 0.0
	for _, c := range perSecond {
		d := float64(c) - mean
		sq += d * d
	}
	cv := math.Sqrt(sq/float64(n)) / mean // population standard deviation
	return 100 * (1 - math.Tanh(cv+math.Pow(cv, 3)/3+math.Pow(cv, 5)/5)), true
}
