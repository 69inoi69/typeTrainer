// How many rounds a letter still needs to be mastered.

package engine

import "math"

type ForecastParams struct {
	Window    int
	MinRounds int
	MaxRounds int
}

type Point struct {
	Count    int
	Mistakes int
	ErrEMA   float64
	TimeEMA  float64
}

func RoundsToMastery(points []Point, p Params, fp ForecastParams) (rounds int, ok bool) {
	if len(points) == 0 {
		return 0, false
	}
	last := points[len(points)-1]
	errOK := last.ErrEMA <= p.MasteryErrorRate
	timeOK := last.TimeEMA > 0 && last.TimeEMA <= p.TargetMs()
	countOK := last.Count >= p.MasteryMinSamples
	if errOK && timeOK && countOK {
		return 0, true
	}
	w := points[max(0, len(points)-max(fp.Window, 2)):]
	if len(w) < max(fp.MinRounds, 2) || last.TimeEMA <= 0 || p.Alpha <= 0 || p.Alpha >= 1 {
		return 0, false
	}
	presses := last.Count - w[0].Count
	if presses <= 0 {
		return 0, false
	}
	per := float64(presses) / float64(len(w)-1)
	need := 0.0
	if !countOK {
		need = float64(p.MasteryMinSamples-last.Count) / per
	}
	if !errOK {
		q := float64(last.Mistakes-w[0].Mistakes) / float64(presses)
		if q >= p.MasteryErrorRate {
			return 0, false
		}
		n := math.Log((p.MasteryErrorRate-q)/(last.ErrEMA-q)) / math.Log(1-p.Alpha)
		need = math.Max(need, n/per)
	}
	if !timeOK {
		slope := lineSlope(w, func(pt Point) float64 { return pt.TimeEMA })
		if slope >= 0 {
			return 0, false
		}
		need = math.Max(need, (last.TimeEMA-p.TargetMs())/-slope)
	}
	if need > float64(fp.MaxRounds) {
		return fp.MaxRounds + 1, true
	}
	return max(1, int(math.Ceil(need))), true
}

func lineSlope(points []Point, y func(Point) float64) float64 {
	n := float64(len(points))
	if n < 2 {
		return 0
	}
	mx, my := (n-1)/2, 0.0
	for _, pt := range points {
		my += y(pt)
	}
	my /= n
	num, den := 0.0, 0.0
	for i, pt := range points {
		dx := float64(i) - mx
		num += dx * (y(pt) - my)
		den += dx * dx
	}
	return num / den
}
