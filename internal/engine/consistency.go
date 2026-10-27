package engine

import "math"

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
	cv := math.Sqrt(sq/float64(n)) / mean
	return 100 * (1 - math.Tanh(cv+math.Pow(cv, 3)/3+math.Pow(cv, 5)/5)), true
}
