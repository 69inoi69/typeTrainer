// The forecast of the Learn panel (owner, 2026-10-21, after keybr): about
// how many rounds a letter still needs to be mastered. It reads only the
// letter's numbers after each of its last rounds: its pace of presses, its
// recent mistakes, and a straight line through its speed (least squares).
// It changes nothing in the model and the word choice never sees it. docs/ALGORITHM.md section 6.2; how good it is: section 10
// ("Forecast").

package engine

import "math"

// ForecastParams are the numbers of the forecast (internal/config).
type ForecastParams struct {
	Window    int // the forecast reads the last this many rounds of the letter
	MinRounds int // with fewer rounds there is no forecast: a line through 2 points is noise
	MaxRounds int // a longer forecast is only "more than MaxRounds"
}

// Point is one letter's numbers after one round: its KeyStat's Count,
// Mistakes, ErrEMA and TimeEMA (0 = no clean timed press yet).
type Point struct {
	Count    int
	Mistakes int
	ErrEMA   float64
	TimeEMA  float64
}

// RoundsToMastery estimates how many more rounds a letter needs to meet the
// goal (MeetsGoal) from points, its numbers after each round, oldest first.
// Each of the three conditions is looked at on its own, over the last
// Window points, and the slowest one decides:
//
//	presses: (MasteryMinSamples - Count) / presses per round
//	errors:  the presses until ErrEMA, moving towards the recent mistake
//	         rate q (mistakes / presses in the window) by Alpha a press,
//	         is under MasteryErrorRate: E_n = q + (E - q)(1 - Alpha)^n,
//	         so n = ln((goal - q) / (E - q)) / ln(1 - Alpha); / presses per round
//	speed:   (TimeEMA - TargetMs) / how fast the time line falls (least squares)
//
// Mistakes are counted, not drawn as a line: one slip lifts ErrEMA by about
// Alpha at once, and a line through that jump would say the letter got
// worse. ok = false when there is no honest answer: fewer than MinRounds
// points, no timed press, no presses in the window, recent mistakes not
// under the goal, or a time line that does not fall (not getting faster).
// A forecast above MaxRounds is returned as MaxRounds + 1 ("more than
// MaxRounds").
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
		return 0, false // not typed lately: no pace to go by
	}
	per := float64(presses) / float64(len(w)-1)
	need := 0.0
	if !countOK {
		need = float64(p.MasteryMinSamples-last.Count) / per
	}
	if !errOK {
		q := float64(last.Mistakes-w[0].Mistakes) / float64(presses)
		if q >= p.MasteryErrorRate {
			return 0, false // as many mistakes as now never reach the goal
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

// lineSlope is the slope of the least-squares line through (i, y(points[i])):
//
//	slope = sum((x - mean x) * (y - mean y)) / sum((x - mean x)^2)
//
// 0 for fewer than two points.
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
